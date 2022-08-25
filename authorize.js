var express = require('express');
var app = express();
require('dotenv').config()

var twitterAPI = require('node-twitter-api');
var twitter = new twitterAPI({
	// application keys for your application
    consumerKey: process.env.TWITTER_APP_KEY,
    consumerSecret: process.env.TWITTER_APP_SECRET,
    callback: 'http://127.0.0.1:3456/auth'
});

var requestToken, requestTokenSecret;

// following instructions from https://www.npmjs.org/package/node-twitter-api


app.get('/', function(req, res){
	twitter.getRequestToken(function(error, _requestToken, _requestTokenSecret, results){
		if (error) {
			res.send(error);
		} else {
			//store token and tokenSecret somewhere, you'll need them later; redirect user
			requestToken = _requestToken;
			requestTokenSecret = _requestTokenSecret;
			
			res.send('<a href="' + twitter.getAuthUrl(requestToken) + '">authenticate</a>');
		}
	});
});

app.get('/auth', function(req, res) {
	twitter.getAccessToken(requestToken, requestTokenSecret, req.query.oauth_verifier, function(error, accessToken, accessTokenSecret, results) {
	    if (error) {
	        res.send(error);
	    } else {
	        //store accessToken and accessTokenSecret somewhere (associated to the user)
	        res.send('accessToken: <b>' + accessToken + '</b><br/>accessTokenSecret: <b>' + accessTokenSecret + '</b>');
	    }
	});	

});

console.log('Visit http://localhost:3456/ to start authentication');
app.listen(3456);