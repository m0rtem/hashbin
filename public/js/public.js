$(document).ready(function() {

	var editor = CodeMirror.fromTextArea(document.getElementById("paste"), {
		lineNumbers: true,
		styleActiveLine: true,
		matchBrackets: true,
		theme: "monokai",
		autoCloseBrackets: true,
		autoCloseTags: true,
		showCursorWhenSelecting: true,
		mode: "javascript",
        keyMap: "sublime",
		enableCodeFolding: true,
	    enableSearchTools: true,
		 showSearchButton: true,
	});
	
	var value = "// The bindings defined specifically in the Sublime Text mode\nvar bindings = {\n";
	var map = CodeMirror.keyMap.sublime;
	for (var key in map) {
	var val = map[key];
	if (key != "fallthrough" && val != "..." && (!/find/.test(val) || /findUnder/.test(val)))
	  value += "  \"" + key + "\": \"" + val + "\",\n";
	}
	value += "}\n\n// The implementation of joinLines\n";
	value += CodeMirror.commands.joinLines.toString().replace(/^function\s*\(/, "function joinLines(").replace(/\n  /g, "\n") + "\n";
	
	editor.enforceMaxLength = function(cm, change) {
		var maxLength = cm.getOption("maxLength");
		if (maxLength && change.update) {
			var str = change.text.join("\n");
			var delta = str.length-(cm.indexFromPos(change.to) - cm.indexFromPos(change.from));
			if (delta <= 0) { return true; }
			delta = cm.getValue().length+delta-maxLength;
			if (delta > 0) {
				str = str.substr(0, str.length-delta);
				change.update(change.from, change.to, str.split("\n"));
			}
		}
		return true;
	}
	
	editor.setOption("maxLength", 500000);
	editor.on("beforeChange", editor.enforceMaxLength);
	
	editor.on("change", function(cm, change) {
		// get value right from instance
		var maxLength = 500000;
		var length = editor.getValue().length;
		var length = maxLength-length;
		//var pasteHash = SHA256.hash($(this).val());
		$('#chars').text(""+length + " chars left");
	
	});


	// Connect the client to a socket	
    var socket = io.connect();
	
	// Handle user disconnect
	//socket.on('userDisconnected', function(data) {
//		 updateParticipants(data.participants);
//	});

	socket.on('connect', function() {
	
		var sessionid = socket.io.engine.id;
        console.log("Connected! UserID is: " + sessionid);
		$('#results').append("Connected! UserID is: " + sessionid + "<hr/>");

		
		var h = sjcl.codec.hex, count = 2048 ;
		salt = h.fromBits(sjcl.random.randomWords('10','0'));
		var key = h.fromBits( sjcl.misc.pbkdf2(sessionid, h.toBits(salt), count) ) ;
		$("#passcode").val(key);
		
		// A function which listens for get_content requests if you are in a have:123 room
        socket.on('get_content', function(data) {

            // Assume user has local content for now and grab it
            var content = localStorage.getItem(data.hash);

            // Assign the destination room name
            var room = "want:" + data.hash;

			// Send a oontent_response message to all in the want:123 room
			socket.emit('content_response', {
				room: room,
				content: content,
				hash: data.hash,
				sessionid: data.sessionid,
				peerid: sessionid
			});
			console.log("User "+data.sessionid+" subscribed to room "+room+" for sharing content");
			$('#results').append("You have succesfully shared content with " + data.sessionid + "<hr/>");
            
        });
		
		// Listens for any incoming content from peers and loads it in localStorage
		socket.on('got_content', function(data) {
			
			console.log("recieved content for hash "+data.hash);

			var shaContent = SHA256.hash(data.content);
			//console.log(shaContent + " - " + data.hash);

			if (data.content != null) {

					// Unsubscribe to want room as we have got the content now
					var wantRoom = "want:" + data.hash;
					socket.emit('unsubscribe', wantRoom, sessionid);
					console.log("Leaving room " + wantRoom);
				
					// Change room to have
					var haveRoom = "have:" + data.hash;
					socket.emit('subscribe', haveRoom, sessionid);
					console.log("Joining room " + haveRoom);
					
					// show live status
					$("#live-banner").fadeIn();
				
					// Set in localstorage for future use
					localStorage.setItem(data.hash, data.content);
					
					$('#results').append("You have recieved the content and are now hosting<hr/>");
					
					editor.setValue("The paste content is encrypted, please enter the correct passcode and press decrypt to read.");
					
				//}
		
			} else {
				// Set data on page
				editor.setValue("Failed to recieve content for hash, soon I will code a retry. Same browser maybe? ;-)");
			}
		
		});
		
		window.onbeforeunload = function(event) {
                var message = 'If you leave any unsaved content will be lost and you will cease hosting any content';
                if (typeof event == 'undefined') {
                    event = window.event;
                    localStorage.clear();
                }
                if (event) {
                    event.returnValue = message;
                    // Clear all local content, for users sake. and for true "user hosting"
                    localStorage.clear();
                }
                return message;

            };
		
		// When user clicks to save paste
		$('#send').click(function() {
			
			var pasteContent = editor.getValue();
			
			if(pasteContent)
			{
				// TODO add some sanatizing gosh
				var pasteEncrypt = sjcl.encrypt($("#passcode").val(), editor.getValue(), {count:2048,salt:salt,ks:256});
	
				var pasteHash = SHA256.hash(editor.getValue());
	
				// Set localstorage, this bit is VERY important 
				localStorage.setItem(pasteHash, pasteEncrypt);
				
				// Subscribe user to list and start hosting content
				var room = "have:" + pasteHash;
				socket.emit('subscribe', room, sessionid);
				console.log("Subscribed to room "+room+" for sharing content");
				
				// show live status
				$("#live-banner").fadeIn();
				
				$('#results').append("Encrypted paste and started hosting <hr/>");
				
				// Change the URL using the history state change
				history.replaceState({}, "Your Page", pasteHash);
			}
			else
			{
				alert("you must enter some text we don't work for nothing you know...");
			}
		
		});
		
		// Paste page handler / check to see if hash exists
		// Get the paste hash from url
        var pasteHash = window.location.href.substring(window.location.href.lastIndexOf('/') + 1);
		
		// Build room names
		var roomWant = "want:" + pasteHash;
        var roomHave = "have:" + pasteHash;
		
		// If there is a hash there then lets grab it if available!
		if(pasteHash)
		{
			
			// Set title for paste page
			$('title').text(pasteHash + " - hashbin");
			
			// Dont need a pass generated as we need to enter a pass to decrypt...
			$("#passcode").val("");
			
			// If user does not have localcontent
			if (localStorage.getItem(pasteHash) === null) {
			
				// Join want room
				socket.emit('subscribe', roomWant, sessionid);
				console.log("Subscribed to room "+roomWant+" for requesting content");
				
				// Send a content_request to peers
				socket.emit('content_request', {
					room: roomHave,
					hash: pasteHash,
					sessionid: sessionid
				});
				console.log("Sent a content_request to room "+roomHave);
				
				// Set this on the editor, normally it will get overwritten but on occasion it wont
				editor.setValue("Failed to recieve content for hash, it's possible there are no peers left or the paste never existed.");

			
			} else {
				
				console.log("Localstorage for hash already stored so no need to retrieve it from peer");
				
			}
			
			$('#decrypt').click(function() {
				
				// Assume we have it for now....
				var content = localStorage.getItem(pasteHash);	
				var newPasteHash = SHA256.hash(content);

				if($("#passcode").val()){
				
					try
					{
						var contentNew = sjcl.decrypt($("#passcode").val(), content);
						
						var newPasteHash = SHA256.hash(contentNew);
						
						if(pasteHash == newPasteHash)
						{
							editor.setValue(contentNew);
							editor.setOption("readOnly", true);
							$('#results').append("Decrypted paste<hr/>");
						}
						else
						{
							editor.setValue("Content of paste does not match the original hash, aborting for your safety.");
						}
						
					}
					catch (error)
					{
						alert(error);
					}
				
				}
				else
				{
					alert("enter a password");
				}
				
			});
		}
		
	});

	// When user clicks about us
	$('.about').click(function() {
		$( "#about" ).addClass( "modalDialogShow" );
		return false;
	});	
	
	// When user clicks how to use
	$('.howto').click(function() {
		$( "#howto" ).addClass( "modalDialogShow" );
		return false;
	});	
	
});

