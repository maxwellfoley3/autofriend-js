/*
The Hivemind account got banned, so until we make a new one, 
we don't need to use this code for now

const TwitterBot = require('./twitter-bot')
const config = require('../accounts-config.js')
const { repeatedlyQuery } = require('./helpers')

module.exports = class TwitterHivemindBot extends TwitterBot {
	constructor(...args) {
		console.log('HivemindBot.constructor')
			super(...args);
	}
	async reply(replyToTweetText, replyToTweetId) {
		console.log('HivemindBot reply', replyToTweetText, replyToTweetId, replyToTweetText.startsWith(`@${this.name} 🐝`))
		if(replyToTweetText.startsWith(`@${this.name} 🐝`)) {
			let parsedInput = replyToTweetText.replace(`@${this.name} 🐝`, '')
			// Check classifier to see if it's hivemind like 
			const res = await repeatedlyQuery({
				method: 'post',
				url: 'https://api.openai.com/v1/completions',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
				}, 
				data: {
					model: `curie:ft-personal:hivemind-classifier-2022-08-20-23-42-40`, 
					temperature: .9, 
					prompt: `${parsedInput}###`,
					max_tokens: 54,
					stop: ['###']
				}
			})
			const responseText = res.data.choices[0].text;
			console.log('responseText', responseText)

			if (responseText.trim().startsWith('B')) {
				return await this._client.v2.reply("🚫", replyToTweetId)

			} else {
				const tweetText = await this.generateResponse(`Reply to "${replyToTweetText}"###`)
				console.log('Replying:', tweetText)
				return await this._client.v2.reply(`🐝${tweetText} 🐝`, replyToTweetId)	
			}
		} else {
			const tweetText = await this.generateResponse(`Reply to "${replyToTweetText}"###`)
			console.log('Replying:', tweetText)
			return await this._client.v2.reply(`${tweetText}`, replyToTweetId)
		}
	}
}*/