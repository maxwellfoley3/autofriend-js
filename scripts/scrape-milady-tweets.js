const readline = require('readline');
const fs = require('fs');
const {TwitterApi} = require('twitter-api-v2');
const readMiladyAccounts = readline.createInterface({
	input: fs.createReadStream('milady-accounts.txt'),
	console: false
});

var writeInterface = fs.createWriteStream('milady-tweets.jsonl', {
  flags: 'a' // 'a' means appending (old data will be preserved)
})

let miladyAccounts = [];
readMiladyAccounts.on('line', (line) => {miladyAccounts.push(line)});
readMiladyAccounts.on('close', async function() {
	const consumerClient = new TwitterApi({
		appKey: process.env.TWITTER_APP_KEY,
		appSecret: process.env.TWITTER_APP_SECRET
	});
	// Obtain app-only client
	const twitterClient = await consumerClient.appLogin();
	
	let miladyAccountFunctions = Array.from(Array(miladyAccounts.length).keys()).map(async (i) => {
		const user = await twitterClient.v2.userByUsername(miladyAccounts[i]).catch(e=>console.log("e",e));
		const tweets = await twitterClient.v2.userTimeline(user.data.id, { max_results: 100, exclude: ['replies', 'retweets'] });
		let j = 0;
		for await (const tweet of tweets) {
			j++;
			
			let text = tweet.text;
			//eliminate links
			text = text.replace(/https([^ ])+/,'');

			// cut tweet in half
			let n = text.length/2;
			while(text.charAt(n)!= ' ' && n < text.length) {
				n++;
			}
			const newObj = { 
				prompt: text.substr(0,n), 
				completion: text.substr(n)
			}
			writeInterface.write(JSON.stringify(newObj) + "\n")
		}
	})

	console.log(miladyAccounts.length,Array.from(miladyAccounts.length))
	Promise.all(miladyAccountFunctions)
})

