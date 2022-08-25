const randomWords = require('random-words');
const { TwitterApi } = require('twitter-api-v2');
const { tweetHasCompleteSentences, tweetHasMeaningfulWords, tweetPassesBadWordCheck } = require('./quality-filters.js')
const { getAccounts } = require('./helpers.js')

const HOURLY_LIMIT = 20;
const ONE_HOUR = 1000 * 60 * 60;
const TEN_MINUTES = 1000 * 60 * 10;
module.exports = class TwitterBot {
	name
	gpt3Model
	tweetFrequency
	id
	_twitterClient
	_openAiClient
	#hourCount
	followerCount 

	constructor(openAiClient, name, tweetFrequency) {
		const accountsConfig = getAccounts()
		if (!accountsConfig.twitter[name] || !accountsConfig.twitter[name].gpt3Model 
			|| !accountsConfig.twitter[name].accessToken || !accountsConfig.twitter[name].accessSecret) {
			throw `No account found for ${name}`
		}

		this._openAiClient = openAiClient
		this.name = name
		this.gpt3Model = accountsConfig.twitter[name].gpt3Model
		this._twitterClient = new TwitterApi({
			appKey: process.env.TWITTER_APP_KEY,
			appSecret: process.env.TWITTER_APP_SECRET,
			accessToken: accountsConfig.twitter[name].accessToken,
			accessSecret: accountsConfig.twitter[name].accessSecret
		})	
		this.tweetFrequency = tweetFrequency
		this.#hourCount = { hour: Date.now() % ONE_HOUR, count: 0 }
		this.followerCount = 0
	}

	async start() {
		let me
		try { 
			me = await this._twitterClient.v2.me()
		} catch (e) {
			console.log(`Unable to log into Twitter account for '${this.name}'`)
			throw e
		}

		// Set account ID
		this.id = me.data.id

		// Tweet on a schedule
		this.tweet()
		setInterval(
			()=>this.tweet.call(this),
			this.tweetFrequency
		)

		// Check for new followers on a schedule and follow them back
		this.checkAndRespondToFollows()
		setInterval(
			()=>this.checkAndRespondToFollows.call(this),
			TEN_MINUTES
		)
	}

	// Hour count = how much this account has tweeted in the last hour
	// The variable is in the form { hour: [num], count: [num] }
	// Representing the current hour (time since epoch % ONE_HOUR) and the number of tweets this hour
	updateHourCountAndCheckIsLimitReached() {
		const now = Date.now();
		if(now % ONE_HOUR > this.#hourCount.hour) {
			this.#hourCount.hour = now & ONE_HOUR;
			this.#hourCount.count = 0;
		}
		this.#hourCount.count++;
		if(this.#hourCount.count > HOURLY_LIMIT) {
			return true
		} return false
	}

	async tweet() {
		try {
			if(!this.updateHourCountAndCheckIsLimitReached()) {
				// Prompt with random word from the dictionary
				// TODO: allow flexiblity for different prompt formats for different models
				const tweetText = await this.generateResponse(randomWords()+'###')
				console.log(`${this.name} tweeting:`, tweetText)
				return await this._twitterClient.v2.tweet(tweetText)
			}
		} catch(e) {
			console.log(`${this.name} tweeting failed:`, e)
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
			validTweetFound = responseText.trim() != '' && (await tweetHasCompleteSentences(this._openAiClient, responseText)) 
			&& (await tweetHasMeaningfulWords(this._openAiClient, responseText))
			&& tweetPassesBadWordCheck(this._openAiClient, responseText)
		}
		console.log("\n\n")
		return responseText
	}

	async reply(replyToTweetText, replyToTweetId) {
		this.updateHourCountAndCheckIsLimitReached()
		try {
			const tweetText = await this.generateResponse(`Reply to "${replyToTweetText}"###`)
			console.log('Replying:', tweetText)
			return await this._twitterClient.v2.reply(tweetText, replyToTweetId)
		} catch(e) {
			console.log('Tweeting failed:', e)
		}
	}

	async checkAndRespondToFollows() {
		try { 
			const followersPaginator = await this._twitterClient.v2.followers(this.id, { asPaginator: true })
			let numNewFollowers = followersPaginator.meta.result_count - this.followerCount
			console.log("Checking for new followers: ", this.name)

			// Kind of a hack - it's complicated with our limited v2 access to query a user to see if he already follows the bot
			// So every time the bot boots back up, it will attempt to re-follow everyone who follows it
			// Limit this to ten times
			// Maybe find better way in the future
			if (numNewFollowers > 10) {
				numNewFollowers = 10
			}

			// Only need to get first page of pagination 
			const followersPage = await followersPaginator.next();

			for (let i = 0; i < numNewFollowers && i < followersPage.data.data.length; i++) {
				const follower = followersPage.data.data[i]
				console.log("Following: ", this.name, follower.name)
				await this._twitterClient.v2.follow(this.id, follower.id)
			}
		} catch(e) {
			console.log('Error following accounts back:', e)
		}
	}
}
