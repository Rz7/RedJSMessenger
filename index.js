var debug 	= require("debug")('Redis'),
	Redis 	= require("ioredis"),
	common 	= require('CommonJS');

	// @Rz7
	// CommonJS library is on my CommonJS repository

module.exports = redis;
function redis(info) {
	var self = this;

	self.info = JSON.parse(JSON.stringify(info));
	self.client = new Redis({
		port: self.info.port,	// Redis port
		host: self.info.host,	// Redis host
		family: 4,				// 4 (IPv4) or 6 (IPv6)
		password: self.info.password,
		db: 0,
		reconnectOnError: (err) => { return 2; }
	});

	self.client2 = new Redis({
		port: self.info.port,	// Redis port
		host: self.info.host,	// Redis host
		family: 4,				// 4 (IPv4) or 6 (IPv6)
		password: self.info.password,
		db: 0,
		reconnectOnError: (err) => { return 2; }
	});

	self.set = (key, value) => {
		// console.log(key, value);
		self.client2.set(key, value);
	};

	self.setEX = (key, value, e) => {
		self.client2.set(key, value, 'EX', e);
	};

	self.get = (key) => {
		return self.client2.get(key);
	};

	self.publish = (channel, message) => {
		self.client2.publish(channel, message);
	};

	self.subscribe = (channel) => {
		self.client.subscribe(channel);
	};

	self.on = (key, callback) => {
		if(key == 'message')
			self.on_message = callback;
	}; self.on_message = null;

	self.client.on('message', (channel, value) => {
		if(isJsonString(value))
		{
			var value = JSON.parse(value);

			if(value.hash)
			{
				if(value.has_answer == -1)
					return;

				if(value.has_answer)
				{
					if(self.regex_[value.hash])
						self.processRegexMessage.add(value.hash, value.result);
				}
				else
				{
					value.has_answer = true;
					value.answer = (new_value) => {
						self.publish(channel+':result', JSON.stringify(new_value));
						value = null;
					}

					if(typeof self.on_message == 'function')
						self.on_message(channel, value);
				}
				return;
			}

			if(typeof self.on_message == 'function')
				self.on_message(channel, value);
		}
	});


	var on_reconnect = {
		cl1: false,
		cl2: false
	};

	self.client.on('error', (err) => {

		if( on_reconnect.cl1)
			return; on_reconnect.cl1 = true;
		
		setTimeout(() => {

			debug('[Client1] %s', err); on_reconnect.cl1 = false;
		  	if(!!err && !!err.indexOf && err.indexOf('NOAUTH Authentication required') > -1)
		    	self.client.auth(self.info.password);

		}, 5000);
	});

	self.client2.on('error', (err) => {
		
		if( on_reconnect.cl2)
			return; on_reconnect.cl2 = true;
		
		setTimeout(() => {

			debug('[Client2] %s', err); on_reconnect.cl2 = false;
		  	if(!!err && !!err.indexOf && err.indexOf('NOAUTH Authentication required') > -1)
		    	self.client2.auth(self.info.password);

		}, 5000);
	});

	self.client.on('connect', () => {
		debug('[%s][Client1] Connected', self.info.host);
	});

	self.client2.on('connect', () => {
		debug('[%s][Client2] Connected', self.info.host);
	});

	self.regex_ = {};
	self.send = (value, callback, timeout) => {
		
		value.hash = getHash(20);
		value.has_answer = false;
		value.callback= callback;

		self.regex_[value.hash] = value;

		self.publish(value.channel, JSON.stringify(value));

		setTimeout(() => {
			self.processRegexMessage.add(value.hash, "fail");
		}, timeout);
	};

	self.processRegexMessage = {

		array: [],

		add: (hash, result) => {
			self.processRegexMessage.array.push({ hash: hash, result: result });
		},

		update: () => {

			if(self.processRegexMessage.array.length == 0)
				return common.start(500).then(self.processRegexMessage.update);

			return common.start().then(() => {
				var value = self.processRegexMessage.array[0];

				if(self.regex_[value.hash] && typeof self.regex_[value.hash].callback == 'function')
				{
					self.regex_[value.hash].callback(value.result);
					delete self.regex_[value.hash];
				}

				self.processRegexMessage.array.splice(0, 1);
				return self.processRegexMessage.update();
			});
		},

		start: () => {
			self.processRegexMessage.array = [];
			self.processRegexMessage.update();
		}
	};
	
	self.processRegexMessage.start();
	return self;
}

function isJsonString (str) {
    try { JSON.parse(str); } catch (e) { return false; } return true;
}

function getHash (length) {
	length = typeof length == 'undefined' ? 5 : length;

	var result = "";
	var values = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_";
	var getRandom = (min, max) => { return Math.floor(Math.random() * (max - min)) + min };

	for(var i = 0; i < length; ++i)
		result += values[getRandom(0, values.length - 1)];

	return result;
}