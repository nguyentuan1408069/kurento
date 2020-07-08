var path = require('path');
var kurento = require('kurento-client');
var Room = require('./entity/room')

var idCounter = 0;
var candidatesQueue = {};
var kurentoClient = null;
var presenter = {};
var viewers = [];
var noPresenterMessage = 'No active presenter. Try again later...';
module.exports = class kurentoRoom {

	constructor(wss, argv){
		if(wss) this.connection(wss);
		this.argv = argv;
	}

	nextUniqueId() {
		idCounter++;
		return idCounter.toString();
	}

	connection(wss){
		let self = this;
		wss.on('connection', function(ws) {
	
			var sessionId = self.nextUniqueId();
			console.log('Connection received with sessionId ' + sessionId);
		
			ws.on('error', function(error) {
				console.log('Connection ' + sessionId + ' error');
				stop(sessionId);
			});
		
			ws.on('close', function() {
				console.log('Connection ' + sessionId + ' closed');
				self.stop(sessionId);
			});

			ws.on('message', function(message) {
				var message = JSON.parse(message);
				console.log('Connection ' + sessionId + ' received message ', message);
				switch (message.id) {
				case 'presenter':
					self.startPresenter(sessionId, message.room_name, message.name, ws, message.sdpOffer, function(error, sdpAnswer) {
						if (error) {
							return ws.send(JSON.stringify({
								id : 'presenterResponse',
								response : 'rejected',
								message : error
							}));
						}
						ws.send(JSON.stringify({
							id : 'presenterResponse',
							response : 'accepted',
							sdpAnswer : sdpAnswer
						}));
					});
					break;
		
				case 'viewer':
					self.startViewer(sessionId, message.room_name, message.name, ws, message.sdpOffer, function(error, sdpAnswer) {
						if (error) {
							return ws.send(JSON.stringify({
								id : 'viewerResponse',
								response : 'rejected',
								message : error
							}));
						}
		
						ws.send(JSON.stringify({
							id : 'viewerResponse',
							response : 'accepted',
							sdpAnswer : sdpAnswer
						}));
					});
					break;
		
				case 'stop':
					self.stop(sessionId,  message.room_name, message.name);
					break;
		
				case 'onIceCandidate':
					self.onIceCandidate(sessionId, message.candidate);
					break;
		
				default:
					ws.send(JSON.stringify({
						id : 'error',
						message : 'Invalid message ' + message
					}));
					break;
				}
			});
		});
	}
	
	/*
	 * Definition of functions
	 */
	
	// Recover kurentoClient for the first time.
	getKurentoClient(callback) {
		if (kurentoClient !== null) {
			return callback(null, kurentoClient);
		}
	
		kurento(this.argv.ws_uri, function(error, _kurentoClient) {
			if (error) {
				console.log("Could not find media server at address " + this.argv.ws_uri);
				return callback("Could not find media server at address" + this.argv.ws_uri
						+ ". Exiting with error " + error);
			}
	
			kurentoClient = _kurentoClient;
			callback(null, kurentoClient);
		});
	}
	
	startPresenter(sessionId, room_name, name, ws, sdpOffer, callback) {
		this.clearCandidatesQueue(sessionId);
		let self = this;
		console.log("room_name:",room_name);
		
		if (presenter !== null && presenter[room_name]) {
			this.stop(sessionId, room_name, name);
			return callback("Another user is currently acting as presenter. Try again later ...");
		}
	
		presenter[room_name] = {
				id : sessionId,
				pipeline : null,
				webRtcEndpoint : null,
				name: name,
		}
	
		self.getKurentoClient(function(error, kurentoClient) {
			if (error) {
				this.stop(sessionId, room_name, name);
				return callback(error);
			}
	
			if (presenter === null) {
				self.stop(sessionId, room_name, name);
				return callback(noPresenterMessage);
			}
	
			kurentoClient.create('MediaPipeline', function(error, pipeline) {
				if (error) {
					self.stop(sessionId, room_name, name);
					return callback(error);
				}
	
				if (presenter === null) {
					self.stop(sessionId, room_name, name);
					return callback(noPresenterMessage);
				}

				let room = new Room({
					name: name,
					room_name: room_name,
					status: 1,
					created_at: new Date(),
					modified_at: new Date()
				})
				self.saveData(room);
				presenter[room_name].pipeline = pipeline;

				var elements =
				[
					{type: 'RecorderEndpoint', params: {uri : self.argv.file_uri, mediaPipeline: pipeline, stopOnEndOfStream: true}},
					{type: 'WebRtcEndpoint', params: {}}
				]
				console.log(self.argv.file_uri);
				
				pipeline.create(elements, function(error, elements) {
					
					if (error) {
						self.stop(sessionId, room_name, name);
						return callback(error);
					}
	
					if (presenter === null) {
						return callback(noPresenterMessage);
					}
					
					var recorder = elements[0];
					var webRtcEndpoint = elements[1];
	
					presenter[room_name].webRtcEndpoint = webRtcEndpoint;
					if (candidatesQueue[sessionId]) {
						while(candidatesQueue[sessionId].length) {
							var candidate = candidatesQueue[sessionId].shift();
							webRtcEndpoint.addIceCandidate(candidate);
						}
					}
	
					webRtcEndpoint.on('OnIceCandidate', function(event) {
						var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
						ws.send(JSON.stringify({
							id : 'iceCandidate',
							candidate : candidate
						}));
					});
	
					webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
						if (error) {
							self.stop(sessionId, room_name, name);
							return callback(error);
						}
	
						if (presenter === null) {
							self.stop(sessionId, room_name, name);
							return callback(noPresenterMessage);
						}
	
						callback(null, sdpAnswer);
					});
	
					webRtcEndpoint.gatherCandidates(function(error) {
						if (error) {
							self.stop(sessionId, room_name, name);
							return callback(error);
						}
					});

					kurentoClient.connect(webRtcEndpoint, recorder, function(error) {
						if (error) return self.onError(error);
					
						presenter[room_name].recorder = recorder;

						recorder.record(function(error) {
							if (error) return onError(error);
					  
							console.log("record");
						  });
					});
				});
			});
		});
	}

	onError(error) {
		if(error) console.log(error);
	  }

	saveData(room){
		let promise = room.save();
		promise.then( () => {
			console.log("luu thanh cong");
	   })
	   .catch((err) => {
		  console.log("vao day roi");
		  
		  console.log(err);
		  next();
	   })
		return promise;
	}
	
	startViewer(sessionId, room_name, name, ws, sdpOffer, callback) {
		this.clearCandidatesQueue(sessionId);
		let self = this;
		if (!presenter) {
			self.stop(sessionId, room_name, name);
			return callback(noPresenterMessage);
		}
	
		presenter[room_name].pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
			if (error) {
				self.stop(sessionId, room_name, name);
				return callback(error);
			}
			viewers[sessionId] = {
				"webRtcEndpoint" : webRtcEndpoint,
				"ws" : ws
			}
	
			if (presenter === null) {
				self.stop(sessionId, room_name, name);
				return callback(noPresenterMessage);
			}
	
			if (candidatesQueue[sessionId]) {
				while(candidatesQueue[sessionId].length) {
					var candidate = candidatesQueue[sessionId].shift();
					webRtcEndpoint.addIceCandidate(candidate);
				}
			}
	
			webRtcEndpoint.on('OnIceCandidate', function(event) {
				var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
				ws.send(JSON.stringify({
					id : 'iceCandidate',
					candidate : candidate
				}));
			});
	
			webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
				if (error) {
					self.stop(sessionId, room_name, name);
					return callback(error);
				}
				if (presenter === null) {
					self.stop(sessionId, room_name, name);
					return callback(noPresenterMessage);
				}
	
				presenter[room_name].webRtcEndpoint.connect(webRtcEndpoint, function(error) {
					if (error) {
						self.stop(sessionId, room_name, name);
						return callback(error);
					}
					if (presenter === null) {
						self.stop(sessionId, room_name, name);
						return callback(noPresenterMessage);
					}
	
					callback(null, sdpAnswer);
					webRtcEndpoint.gatherCandidates(function(error) {
						if (error) {
							self.stop(sessionId, room_name, name);
							return callback(error);
						}
					});
				});
			});
		});
	}
	
	clearCandidatesQueue(sessionId) {
		if (candidatesQueue[sessionId]) {
			delete candidatesQueue[sessionId];
		}
	}
	
	stop(sessionId, room_name= '', name ='' ) {
		if (presenter !== null && presenter[room_name]) {
			for (var i in viewers) {
				var viewer = viewers[i];
				if (viewer.ws) {
					viewer.ws.send(JSON.stringify({
						id : 'stopCommunication'
					}));
				}
			}
			presenter[room_name].recorder.stopAndWait( (error) => {
				console.log(error);
			});
			// presenter[room_name].recorder.release();
			presenter[room_name].pipeline.release();

			delete presenter[room_name];
			viewers = [];
			
			let promise = Room.updateMany({room_name: room_name,name: name, status: 1}, {$set: {status: 0, modified_at: new Date()} }).exec();
			promise.then( () => {
				console.log("update thanh cong");
		   })
		   .catch((err) => {
			  console.log(err);
			  next();
		   })
	
		} else if (viewers[sessionId]) {
			console.log('viewvers:',sessionId);
			
			viewers[sessionId].webRtcEndpoint.release();
			delete viewers[sessionId];
		}
	
		this.clearCandidatesQueue(sessionId);
	
		if (viewers.length < 1 && !presenter) {
			console.log('Closing kurento client');
			kurentoClient.close();
			kurentoClient = null;
		}
	}
	
	onIceCandidate(sessionId, _candidate) {
		var candidate = kurento.getComplexType('IceCandidate')(_candidate);
	
		if (presenter && presenter.id === sessionId && presenter.webRtcEndpoint) {
			console.info('Sending presenter candidate');
			presenter.webRtcEndpoint.addIceCandidate(candidate);
		}
		else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
			console.info('Sending viewer candidate');
			viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
		}
		else {
			// console.info('Queueing candidate');
			if (!candidatesQueue[sessionId]) {
				candidatesQueue[sessionId] = [];
			}
			candidatesQueue[sessionId].push(candidate);
		}
	}
}