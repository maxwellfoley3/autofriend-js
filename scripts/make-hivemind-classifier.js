
const { TwitterApi } = require('twitter-api-v2');
const randomWords = require('random-words');
require('dotenv').config()
const fs = require('fs')
const { Configuration, OpenAIApi } = require("openai");

const { getAccounts } = require('../bot/helpers.js');
let accountsConfig = getAccounts()

const NEGATIVE_EXAMPLES_NUM = 1000;
const POSITIVE_EXAMPLES_NUM = 400;
const CURRENT_HIVEMIND_MODEL = 'curie:ft-personal:hivemind-2022-08-19-21-28-10'

// Check input arguments & config variables
if (process.argv.length < 3) {
	console.log('Usage: node make-hivemind-classifier.js <output-file> <user-for-timeline-data>')
	process.exit(1)
}

const outFile = process.argv[2]
const user = process.argv[3]

if (!process.env.TWITTER_APP_KEY) {
	console.log('TWITTER_APP_KEY not set')
	process.exit(1)
}
if (!process.env.TWITTER_APP_SECRET) {
	console.log('TWITTER_APP_SECRET not set')
	process.exit(1)	
}
if (!process.env.OPENAI_API_KEY) {
	console.log('OPENAI_API_KEY not set')
	process.exit(1)	
}
if (!accountsConfig.twitter[user] || !accountsConfig.twitter[user].accessToken || !accountsConfig.twitter[user].accessSecret) {
	console.log(`No credentials for ${user} found in accounts-config.dev.js`)
	process.exit(1)
}

const writeInterface = fs.createWriteStream(outFile, { flags: 'a' })

// Initialize the twitter API client
let client
try {
	client = new TwitterApi({
		appKey: process.env.TWITTER_APP_KEY,
		appSecret: process.env.TWITTER_APP_SECRET,
		accessToken: accountsConfig.twitter[user].accessToken,
		accessSecret: accountsConfig.twitter[user].accessSecret
	})
} catch (e) {
	console.log('Twitter client failed to initialize with error:', e)
	process.exit(1)
}

// Initialize the openai API client
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);


	
async function getNegatives() {
	const homeTimeline = await client.v2.homeTimeline()
	totalSeen = 0;
	while (!homeTimeline.done && totalSeen < NEGATIVE_EXAMPLES_NUM) {
		for (let i = 0; i < homeTimeline.data.data.length && totalSeen < NEGATIVE_EXAMPLES_NUM; i++) {
			let text = homeTimeline.data.data[i].text;
			text = text.replace(/RT @\S+ /g, '')
			text = text.replace(/@\S+/g, '')
			text = text.replace(/https\S+/g, '')
			text = text.trim()
			if (text != '') {
				let output = {prompt:`${text}###`, completion:' B'}
				writeInterface.write(JSON.stringify(output) + "\n")
				totalSeen++;
			}
		}
		await homeTimeline.fetchNext();
	}
}

async function getPositives() {
	for (let i = 0; i < POSITIVE_EXAMPLES_NUM; i++) {
		const res = await openai.createCompletion({
			model: CURRENT_HIVEMIND_MODEL, 
			prompt: randomWords()+'###',
			temperature: .9, 
			max_tokens: 54,
			stop: ['###']
		})

		responseText = res.data.choices[0].text
		let output = {prompt:`${responseText}###`, completion:' A'}
		writeInterface.write(JSON.stringify(output) + "\n")
	}
}

getNegatives()
getPositives()