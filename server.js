/* 
  Module dependencies:

  - Express
  - Http (to run Express)
  - Body parser (to parse JSON requests)
  - Underscore (because it's cool)
  - Socket.IO

  It is a common practice to name the variables after the module name.
  Ex: http is the "http" module, express is the "express" module, etc.
  The only exception is Underscore, where we use, conveniently, an 
  underscore. Oh, and "socket.io" is simply called io. Seriously, the 
  rest should be named after its module name.

*/
//This is for heroku the bitch
var port = Number(process.env.PORT || 8080);

var express = require("express")
  , app = express()
  , http = require("http").createServer(app)
  , bodyParser = require("body-parser")
  , io = require("socket.io").listen(http)
  , _ = require("underscore");

	
/* Server config */

//Server's IP address
app.set("ipaddr", "127.0.0.1");

//Server's port number 
app.set("port", port);

//Specify the views folder
app.set("views", __dirname + "/views");

//View engine is EJS
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

//Specify where the static content is
app.use(express.static("public", __dirname + "/public"));

//Tells server to support JSON requests
app.use(bodyParser.json());


/* Server routing */

//Handle route "GET /", as in "http://localhost:8080/"
app.get("/", function(request, response) {

  //Render the view called "index"
  response.render("index.html");

});

app.get("/:hashid", function(request, response) {

	response.render("paste.html");

});

// Handle incoming requests to server
io.sockets.on('connection', function(socket){
	
	// Subscribe client to room
    socket.on('subscribe', function(room, sessionid) { 
        console.log('User '+sessionid+' is joining room ' + room);
        socket.join(room); 
    })
	
	// Unsubscribe client from room
	socket.on('unsubscribe', function(room, sessionid) {  
		console.log('User '+sessionid+' is leaving room' + room);
		socket.leave(room); 
	})
	
	// Request the paste content from the peers in the room
	socket.on('content_request', function(data) {
		console.log('User '+data.sessionid+' is sending a get_content request to '+data.room);
		socket.broadcast.to(data.room).emit('get_content', data);
	});
	
	// The peers have responded and need to send the request back to the requesters
	socket.on('content_response', function(data) {
		console.log('User '+data.peerid+' is sending content to '+data.sessionid+' @ '+data.room);
		socket.broadcast.to(data.room).emit('got_content', data);
	});

	
});

//Start the http server at port and IP defined before
http.listen(app.get("port"), function() {
  console.log("Server up and running. Go to http://" + app.get("ipaddr") + ":" + app.get("port"));
});