const readline = require('readline')
const fs = require('fs');

const inFile = process.argv[2]
const outFile = process.argv[3]

const readInterface = readline.createInterface({
	input: fs.createReadStream(inFile),
	output: process.stdout
});

const writeInterface = fs.createWriteStream(outFile)

readInterface.on('line', processLine);

function processLine(line) {
	const obj = JSON.parse(line)
	let n = obj.completion.length/2
	while(obj.completion.charAt(n)!= ' ' && n < obj.completion.length) {
		n++;
	}
	const newObj = { 
		prompt: obj.completion.substr(0,n), 
		completion: obj.completion.substr(n)
	}

	writeInterface.write(JSON.stringify(newObj)+"\n")
}
