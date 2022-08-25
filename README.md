# autofriend

## 1. Set environment variables 
To run, first set your authentication variables for your OpenAi account and Twitter app developer account in a `.env` file. You can look at `.example-env` to see the names of the environment variables that need to be set. For now, a MongoDb url is only necessary for the hivemind bot, as it is the only one that writes to storage, so if you're not running the hivemind bot, you shouldn't need to worry about it being set.

## 2. Set bot information
Put the information for the bots you want to use in a file called `accounts-config.dev.js`. You can look at `accounts-config.js` (this is the file that will run when the code is pushed to Heroku) for the example format. You will need to supply credentials for your bot as well as the name of their GPT3 model in whatever OpenAI account you are using. 

Getting credentials for a Discord bot is easy to figure out (just google instructions). Twitter is a little more complicated. First make a new twitter account and log into it. Then run `node authorize.js` in this folder. Then go to `http://localhost:3456`. There you will receive your per-user per-app credentials.

Now, edit the `startBots` function in `main.js` to include the names of the bots you want to run (as registered in `accounts-config.dev.js`). 

## 3. Run the bots

Run 

`npm i`

`npm start`

