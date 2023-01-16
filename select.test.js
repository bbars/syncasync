import Teleport from './Teleport.js';
import Channel from './Channel.js';
import select from './select.js';
import assert from 'assert';
import { ErrorCancelled, ErrorClosed } from './errors.js';

function debug(...args) {
	// console.debug(...args); // suppress debug
}

it('select: tick-after-tick-tick', async () => {
	const timeStart = Date.now();
	for await (const [msg, source] of select(after(10), tick(10, 'one'), tick(10, 'two'))) {
		debug(`selected recv (from ${source.__label}):`, msg);
		if (Date.now() - timeStart >= 100) {
			break;
		}
	}
});

it('select: shared counter concurrency', async () => {
	let counter = 0;
	function yilder(label) {
		const chan = new Channel();
		(async () => {
			while (!chan.isClosed) {
				const delay = Math.random() * 10 | 0;
				await sleep(delay, `${label} sleep`);
				try {
					debug('counter change ++', counter+1);
					await chan.send(++counter);
					debug('counter changed++', counter);
				}
				catch (err) {
					if (err instanceof ErrorCancelled || err instanceof ErrorClosed) {
						debug('caught ErrorCancelled');
						counter--;
						debug('counter changed--', counter);
					}
				}
			}
		})();
		return chan;
	}
	
	const yilders = [
		yilder('A'),
		yilder('B'),
		yilder('C'),
	];
	
	let sum = 0;
	const counterLimit = 10;
	for await (const [num] of select(...yilders)) {
		debug('num', num);
		sum += num;
		if (counter >= counterLimit) {
			break;
		}
	}
	
	await sleep(20, 'sleep before finish');
	for (const yilder of yilders) {
		await yilder.close();
	}
	await sleep(20, 'sleep after finish');
	
	// debug('counter', counter);
	// assert.equal(counter, counterLimit + yielders.length, 'final counter value is wrong'); // not sure
	debug('sum', sum);
	const expectedSum = (counterLimit * (counterLimit + 1)) / 2;
	assert.equal(sum, expectedSum, 'wrong sum of R=[1, 100]');
});

// UTILS:

async function sleep(delay, debugMsg = 'sleep') {
	debug(`${debugMsg}: ${delay}ms`);
	return new Promise(r => setTimeout(r, delay));
}

function after(delay, label = 'after') {
	const tele = new Teleport();
	tele.__label = label;
	(async () => {
		await new Promise(r => setTimeout(r, delay));
		await tele.send(new Date());
	})();
	return tele;
}

function tick(delay, label = 'tick') {
	const chan = new Channel();
	chan.__label = label;
	(async () => {
		while (!chan.isClosed) {
			await chan.send(new Date());
			await new Promise(r => setTimeout(r, delay));
		}
	})();
	return chan;
}
