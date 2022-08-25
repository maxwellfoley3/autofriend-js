module.exports.tweetHasCompleteSentences = async function(openAiClient, tweet) {
	console.log('Checking to see if tweet has complete sentences:', tweet)
	const res = await openAiClient.createCompletion({
		model: 'text-davinci-002', 
		prompt: `Please respond 'A' if this fragment of text begins at the beginning \
		of a sentence and ends at the end of a sentence, and 'B' if it starts in \
		the middle of a sentence or cuts off before it reaches the end of a sentence: \
		${tweet}`, 
		temperature: 0, 
		max_tokens: 54,
	})
	answer = res.data.choices[0].text
	if (answer.trim() == 'A') {
		console.log('Tweet is complete sentence')
		return true;
	}
	console.log('Tweet is fragmentary')
	return false;
}

module.exports.tweetHasMeaningfulWords = async function(openAiClient, tweet) {
	console.log('Checking to see if tweet has meaningful words:', tweet)
	const res = await openAiClient.createCompletion({
		model: 'text-davinci-002', 
		prompt: `Please respond 'A' if this fragment of text contains only meaningful \
		words, and 'B' if it contains nonsense words: \
		${tweet}`, 
		temperature: 0, 
		max_tokens: 54,
	})
	answer = res.data.choices[0].text
	if (answer.trim() == 'A') {
		console.log('Tweet has meaningful words')
		return true;
	}
	console.log('Tweet has nonsense words')
	return false;
}

// Only word bad enough to explicitly blacklist for now
// Cornelius Kennington tweeted it the other day, smh
module.exports.tweetPassesBadWordCheck = function(openAiClient, tweet) {
	return tweet.indexOf('nigger')==-1
}