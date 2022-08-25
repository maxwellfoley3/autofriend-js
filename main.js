const { ETwitterStreamEvent, TwitterApi } = require('twitter-api-v2')
const Bot = require('./bot/twitter-bot.js')
const HivemindBot = require('./bot/twitter-hivemind-bot.js')
const DiscordBot = require('./bot/discord-bot.js')
const DiscordHivemindBot = require('./bot/discord-hivemind-bot.js')
require('dotenv').config()
const { MongoClient } = require("mongodb")

// Initialize Mongo client
if (!process.env.MONGO_URI) {
	console.log('MONGO_URI not set')
	process.exit(1)
}

// Initialize OpenAI client
const { Configuration, OpenAIApi } = require("openai");
if (!process.env.OPENAI_API_KEY) {
	console.log('OPENAI_API_KEY not set')
	process.exit(1)	
}
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

let openAiClient
try {
	openAiClient  = new OpenAIApi(configuration)
} catch (e) {
	console.log('An error occurred while connecting to MongoDB', e)
	process.exit(1)
}

// Initialize Twitter app client (per-user clients will be initialized in bot constructors)
if (!process.env.TWITTER_BEARER_TOKEN) {
	console.log('TWITTER_BEARER_TOKEN not set')
	process.exit(1)
}
let twitterClientAppAuth 
try {
	twitterClientAppAuth = new TwitterApi(process.env.TWITTER_BEARER_TOKEN)
} catch (e) {
	console.log('An error occurred while connecting to Twitter', e)
	process.exit(1)
}

// This function is necessary because constructors can't include async methods,
// and we need the gpt3Model for the constructor
// Possibly we could refactor this
async function createHivemindBot() {
	let mongoClient
	try {
		mongoClient = new MongoClient(process.env.MONGO_URI)
	} catch (e) {
		console.log('An error occurred while connecting to MongoDB', e)
		process.exit(1)
	}

	const hivemindBot = new DiscordHivemindBot({openAiClient, mongoClient, name:'HIVEMIND', replyFrequency:10})
	return hivemindBot
}

async function startBots() {
	const twitterBots = [ 
		new Bot(openAiClient, 'autofriend', 1000 * 60 * 60 * 3),	
		new Bot(openAiClient, 'angelicism_bk', 1000 * 60 * 60 * 3)
	]

	for (twitterBot of twitterBots) {
		await twitterBot.start()
	}

	const discordBots = [
		new DiscordBot({ openAiClient, name:'autofriend', replyFrequency:10 }),
		new DiscordBot({ openAiClient, name:'Cornelius Kennington', replyFrequency:10}),
		new DiscordBot({ openAiClient, name:'Angelicism Bangkok', replyFrequency:10}),
		await createHivemindBot()
	]


	for ( discordBot of discordBots ) {
		await discordBot.start()
	}
	discordBots[0].fineTuneNewModel()

	return { twitterBots, discordBots }
}

async function startTwitterStream(bots) {
	try {
		// Delete old rules
		const rules = await twitterClientAppAuth.v2.streamRules();
		if (rules.data && rules.data.length) {
			await twitterClientAppAuth.v2.updateStreamRules({
				delete: { ids: rules.data.map(rule => rule.id) },
			});
		}

		// Right now, the only events we are looking for is responses to our bots
		await twitterClientAppAuth.v2.updateStreamRules({
			add: bots.map(bot => ({ value: `to:${bot.name}`, tag: `to:${bot.name}` }) ),
		})

		const stream = await twitterClientAppAuth.v2.searchStream({
			'tweet.fields': ['referenced_tweets', 'author_id'],
			expansions: ['referenced_tweets.id'],
		})

		console.log('Twitter stream started')

		stream.autoReconnect = true;
		stream.on(ETwitterStreamEvent.Data, async tweet => {
			for (rule of tweet.matching_rules) {
				if (rule.tag.startsWith('to:')) {
					const bot = bots.find(bot => bot.name === rule.tag.substring(3))
					if (bot) {
						await bot.reply(tweet.data.text, tweet.data.id)
					}
				}
			}
		})
	} catch (e) {
		console.log('Twitter stream failed to start with error:' , e);
	}
}

async function go() {
	const { twitterBots } = await startBots()
	// startTwitterStream(twitterBots)
}
go()
