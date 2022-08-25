const DiscordBot = require('./discord-bot')
const { sleep } = require('./helpers')
const process = require('process')
const fs = require('fs')
const mkdirp = require('mkdirp')

const TEST_CHANNEL_ID = '1010978005683806269'
const HIVE_CHANNEL_ID = '1011005608931102812'
const TEN_MINUTES = 1000 * 60 * 10
const FINETUNE_BATCH_SIZE = 100
// TODO, put this in the database aand update it when the main model is fine-tuned
const CURRENT_CLASSIFIER_MODEL =`curie:ft-personal:hivemind-classifier-2022-08-20-23-42-40`
module.exports = class DiscordHivemindBot extends DiscordBot { 
	_mongoClient
	fineTuneUpdateInProgress = false
	constructor({mongoClient, ...args}) {
		super({...args});
		this._mongoClient = mongoClient
	}

	async start() {
		// Dynamically load model for Hivemind
		const mongoDatabase = this._mongoClient.db('hivemind')
		const misc = mongoDatabase.collection('misc')
		const hivemindGpt3ModelRecord = (await misc.findOne({ key: 'HIVEMIND_CURRENT_MODEL' }))
		if(!hivemindGpt3ModelRecord) {
			console.log('HIVEMIND_CURRENT_MODEL not set in database')
			process.exit(1)
		}

		this.gpt3Model = hivemindGpt3ModelRecord.value
		await super.start()
		this.postRegularlyInHive()
	}

	// Post in the hive channel every ten minutes
	async postRegularlyInHive() {
		while (true) {
			const newMessage = await this.generateResponse('###')
			const channel = this._discordClient.channels.cache.get(HIVE_CHANNEL_ID)
			channel.send(newMessage)
			await sleep(TEN_MINUTES)
		}
	}

	// Fine-tune the model with the new contributions
	async fineTuneNewModel() {
		// Don't initiate a new fine-tune if there is already one in progress
		if (this.fineTuneUpdateInProgress) return 
		try {
			this.fineTuneUpdateInProgress = true

			// Collect all the new contributions
			const mongoDatabase = this._mongoClient.db('hivemind')
			const contributions = mongoDatabase.collection('contributions')
			const newContributions = await contributions.find({ addedToHivemind:false })

			// Write a file with the new fine-tuning data
			await mkdirp(`${process.cwd()}/data/generated`)
			const filename = `${process.cwd()}/data/generated/hivemind-fine-tune-${Date.now()}.txt`
			const writeInterface = fs.createWriteStream(filename)
			await newContributions.forEach(async contribution => {
				// Strip input of user references in the form of <@userId>
				const parsedText = contribution.text.replace(/<@.*>\s/, '')
				const obj = {prompt:'###', completion:` ${parsedText}###`}
				await writeInterface.write(JSON.stringify(obj) + "\n")
			})

			// Upload the file to openAi through their API
			const fileUploadResponse = await this._openAiClient.createFile(
				fs.createReadStream(filename),
				'fine-tune'
			)
			
			// Send the fine-tune request
			console.log('Sending Hivemind fine tuning request')
			const response = await this._openAiClient.createFineTune({
				training_file: fileUploadResponse.data.id,
				model: this.gpt3Model,
				suffix: `hivemind-fine-tune-${Date.now()}`,
				learning_rate_multiplier: 0.002
			})

			// Repeatedly query to see if the fine-tune is complete
			const fineTuneId = response.data.id
			let fineTuneFinished = false
			let attempts = 0
			while (!fineTuneFinished && attempts < 20) {
				attempts++
				const fineTuneRetrievalResponse = await this._openAiClient.retrieveFineTune(fineTuneId)
				if (fineTuneRetrievalResponse.data.status == 'succeeded') {
					fineTuneFinished = true
					const newFineTuneModel = fineTuneRetrievalResponse.data.fine_tuned_model

					// Update the model locally in the app
					this.gpt3Model = newFineTuneModel

					// Update the model in the database
					const misc = mongoDatabase.collection('misc')
					await misc.updateOne({ key: 'HIVEMIND_CURRENT_MODEL'}, { $set: { value: newFineTuneModel }  })

					// Record all contributions as having been added to the hivemind
					const contributions = mongoDatabase.collection('contributions')
					await contributions.updateMany({ addedToHivemind: false }, { $set: { addedToHivemind: true }})

					// Send discord message notifying of update
					const channel = this._discordClient.channels.cache.get(HIVE_CHANNEL_ID)
					this.fineTuneUpdateInProgress = false
					channel.send(`🐝🐝🐝 HIVEMIND has updated 🐝🐝🐝`)
					
				} else {
					// Wait one minute and try again
					await sleep(60 * 1000)
				}
			}


		} catch (e) {
			this.fineTuneUpdateInProgress = false
			console.log('An error occured while fine-tuning', e)
		}
	}

	// Check to see if a text could have come from the hivemind
	async classify(text) {
		const res = await this._openAiClient.createCompletion({
			model: CURRENT_CLASSIFIER_MODEL, 
			temperature: .9, 
			prompt: `${text}###`,
			max_tokens: 54,
			stop: ['###']
		})
		const responseText = res.data.choices[0].text;
		console.log(`Hivemind classified ${text} as ${responseText}`)
		// The classifier returns A for hivemind-like and B for non-hivemind-like
		return responseText.trim().startsWith('A')
	}

	// Check to see if a text could have come from the hivemind and update it in the database if it is classified as such
	async classifyAndRecord(text, userId) {
		const isHivemindLike = await this.classify(text)
		if(isHivemindLike) {
			try {
				const mongoDatabase = this._mongoClient.db('hivemind')
				const contributionCountCollection = mongoDatabase.collection('contributionCount');
				const contributionCount = await contributionCountCollection.findOne({ userId: userId, app: 'discord'})

				// Update the count of contributions for the user
				if (contributionCount == null) {
					contributionCountCollection.insertOne({ userId: userId, app: 'discord', count: 1 })
				} else {
					contributionCountCollection.updateOne({ userId: userId, app: 'discord'}, { $inc: { count: 1 }})
				}
	
				// Add new contribution to the database of contributions
				const contributions = mongoDatabase.collection('contributions');
				await contributions.insertOne({ addedToHivemind:false, text: text, userId: userId, app: 'discord' })
				
				// If we have 100 new records, run a new fine-tune
				// Get a count of the number of new records
				const newContributions = await contributions.count({ addedToHivemind:false })
				if (newContributions >= FINETUNE_BATCH_SIZE) {
					await this.fineTuneNewModel()
					// TODO, also finetune new classifier
				}
			} catch (e) {
				console.log('An error occured adding records to hiveminds database', e);
			}
		}
		return isHivemindLike
	}
	
	// Get number of contributions a given user has added to the hivemind
	async getCountForUser(userId) {
		const mongoDatabase = this._mongoClient.db('hivemind')
		const contributionCountCollection = mongoDatabase.collection('contributionCount');
		const contributionCount = await contributionCountCollection.findOne({ userId: userId, app: 'discord'})
		if (contributionCount) {
			return contributionCount.count
		} else {
			return 0
		}
	}

	// Runs every time a message is posted in the discord
	// Classify & record all messages in Test or Hive channels, and then
	// do the standard responses the other bots do
	async onMessageCreate(message) {
		if((message.channelId == TEST_CHANNEL_ID || message.channelId == HIVE_CHANNEL_ID)
				&& message.author.username != this.name) {

			const isHivemindLike = await this.classifyAndRecord(message.content, message.author.id)
			if (isHivemindLike) {
				message.react('🐝')
			}
		}
		super.onMessageCreate(message)
	}

	async reply(message) {
		try { 
			// let parsedInput = message.content.replace(/<@.*>\s/, '')
			// Respond to !count with the number of contributions the user has made to the hivemind
			if(message.content.indexOf(`!count`) > -1) {
				return await message.reply(`✨ ${(await this.getCountForUser(message.author.id))} ✨`)	
			}

			// Take out this behavior for now because it's probably unnecessary
			/*
			if(parsedInput.startsWith(`🐝`)) {
				parsedInput = message.content.replace(`🐝 `, '')
				// Check classifier to see if it's hivemind like 
				const isHivemindLike = await this.classifyAndRecord(parsedInput, message.author.id)
				if (!isHivemindLike) {
					return await message.react("🚫")

				} else {
					const replyText = await this.generateResponse(`Reply to "${message.content}"###`)
					console.log('Replying:', replyText)
					return await message.reply(`🐝${replyText} 🐝`)	
				}
			} else {*/
				const replyText = await this.generateResponse(`Reply to "${message.content}"###`)
				console.log('Replying:', message.content)
				return await message.reply(`${replyText}`)
			//}
		} catch (e) {
			console.log('e')
		}
	}
}