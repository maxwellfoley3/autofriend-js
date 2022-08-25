const Discord = require('discord.js');
const { tweetHasCompleteSentences, tweetHasMeaningfulWords, tweetPassesBadWordCheck } = require('./quality-filters.js')
const { getAccounts } = require('./helpers.js')

const MINUTE_LIMIT = 3;
const ONE_MINUTE = 1000 * 60;

const HIVE_CHANNEL_ID = '1011005608931102812'

module.exports = class DiscordBot {
	_openAiClient
	_discordClient
	name
	gpt3Model
	replyFrequency
	#minuteCount

	constructor({ openAiClient, name, replyFrequency }) {
		const config = getAccounts()
		if (!config.discord[name] || !config.discord[name].gpt3Model || !config.discord[name].token) {
			throw `No config found for ${name}`
		}
		this._openAiClient = openAiClient
		this.name = name
		this.gpt3Model = config.discord[name].gpt3Model
		this.replyFrequency = replyFrequency
		this._discordClient = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds, Discord.GatewayIntentBits.GuildMessages, Discord.GatewayIntentBits.MessageContent] });
		this.#minuteCount = { minute: Date.now() % ONE_MINUTE, count: 0 }
	}


	// Minute count = how much this account has tweeted in the last minute
	// The variable is in the form { Minute: [num], count: [num] }
	// Representing the current minute (time since epoch % ONE_MINUTE) and the number of messages this minute

	// TODO: not sure if this works, the bots have gotten in endless loops before, or maybe a minute is too short
	checkAndUpdateMinuteCount() {
		const now = Date.now();
		if(now % ONE_MINUTE > this.#minuteCount.minute) {
			this.#minuteCount.minute = now & ONE_MINUTE;
			this.#minuteCount.count = 0;
		}
		this.#minuteCount.count++;
		if(this.#minuteCount.count > MINUTE_LIMIT) {
			throw "Minute limit reached!";
		}
	}


	async generateResponse(prompt) {	
		let validTweetFound = false;
		let responseText = '';
		let attempts = 0;
		// Keep trying to generate a valid tweet until we reach the maximum number of attempts
		while(!validTweetFound && attempts < 6) {
			attempts++;
			const res = await this._openAiClient.createCompletion({
				model: this.gpt3Model, 
				prompt,
				temperature: .9, 
				max_tokens: 54,
				stop: ['###']
			})
			console.log(`${this.name} got gpt-3 response for input ${prompt}:`, responseText)
			responseText = res.data.choices[0].text;
			// Reject tweets that have incomplete sentences, nonsense words, or bad words
			validTweetFound = responseText.trim() !== '' && (await tweetHasCompleteSentences(this._openAiClient, responseText)) 
			&& (await tweetHasMeaningfulWords(this._openAiClient, responseText))
			&& tweetPassesBadWordCheck(this._openAiClient, responseText)
		}
		return responseText
	}

	async reply(message) {
		try {
			let messageText = message.content
			console.log(`Replying to ${message.content} from ${this.name}`)
			// Strip out the @mentions
			let responseText = await this.generateResponse(messageText.replace(/<@.*>\s/, ''))
			message.reply(responseText)
		} catch(e) {
			console.log(`${this.name} reply failed:`, e)
		}
	}

	// This function will fire whenever there is a new message in Discord
	async onMessageCreate(message) {
		console.log('Message received:', message.content)
		// Look for messages tagging this bot and respond
		if (message.mentions.users.has(this._discordClient.user.id) || message.mentions.roles.has(this._discordClient.user.id)) {
			if (message.author.bot) {
				// only 50/50 chance of responding to bots
				if (Math.random()*2 < 1) {
					await this.reply(message)
				}
			} 
			else {
				await this.reply(message)
			}
		}
		// Look for messages in the HIVE channel and respond
		else if(message.channelId == HIVE_CHANNEL_ID && message.author.username != this.name) {
			// 1 in replyFrequency chance
			if(Math.random() * this.replyFrequency < 1) {
				this.reply(message)
			}
		}
	}
	
	async start() {
		this._discordClient.on('ready', () => {
			console.log(`Logged in as ${this._discordClient.user.tag}!`);
		 });
		 
		this._discordClient.on('messageCreate', this.onMessageCreate.bind(this));
		
		// Log in our bot
		const config = getAccounts()
		await this._discordClient.login(config.discord[this.name].token);
	}
}