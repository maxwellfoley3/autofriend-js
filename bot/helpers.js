const axios = require('axios');

module.exports.getAccounts = function () {
	if(process.env.ENVIRONMENT == 'production') {
		return require('../accounts-config.js')
	} else {
		try {
			return require('../accounts-config.dev.js')
		} catch (e) {
			console.log(
				`bot-accounts-config.dev.js not found:\n` +
				`When running in development mode, you must create a ` +
				`bot-accounts-config.dev.js file with your bot accounts in it.`
			)
			process.exit(1)
		}
	}
}

module.exports.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports.repeatedlyQuery = async function(params, maxAttempts = 10) {
	let attempts = 0
	while(true) {
		try {
			return await axios(params)
		} catch (err) {
			console.log('Error in repeatedlyQuery', err.message)
			if (err.message == 'Request failed with status code 500') {
				await sleep(5000)
			}
			attempts++
			if (attempts >= maxAttempts) {
				throw err
			}
		}
	}
}