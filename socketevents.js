var url = wsAddress ? wsAddress : "ws://13.235.24.232:8000";

var ws =  new WebSocket(url);
console.log(Config);

//if(localStorage.getItem("token") == "Guest") localStorage.clear();


ws.onopen = (event) => {
	console.log("Testt")
	
	ws.send("Here's some text that the server is urgently awaiting!");
    if(localStorage.getItem("token") && localStorage.getItem("token") != "Guest") ws.send("%getuser%" + localStorage.getItem("token"));
	if(localStorage.getItem("battles") && localStorage.getItem("token") != "Guest") {
		let battles = JSON.parse(localStorage.getItem("battles"))
		if(typeof battles != typeof []) battles = new Array(battles);
		localStorage.setItem("battles",JSON.parse(battles));

		battles.forEach((battle) => {
			if(battle) ws.send(`%hasBattle%${battle.split("-")[2].trim()}%participant%${localStorage.getItem("token")}`)
		})
	}
};

ws.onclose = (event) => {
	let a = confirm("Connection lost to the server! Reconnect?");
	if(a) window.location.reload();
};

ws.onmessage = (event) => {
	console.log(event.data);

    if(event.data.startsWith("%j")) {
        let battle = event.data.split("%")[2];
        let secret = battle.split("-")[2];
        
        console.log(localStorage.getItem("replays"));

        let battles = localStorage.getItem("battles") ? JSON.parse(localStorage.getItem("battles")) : [];
        if(!battles.includes(battle) && !battle.endsWith("replay")) battles.push(battle)
        console.log(battles);
        localStorage.setItem("battles",JSON.stringify(battles));
        console.log(localStorage.getItem("battles"));

		let replays = localStorage.getItem("replays") ? JSON.parse(localStorage.getItem("replays")) : [];
        if(!replays.includes(battle) && battle.endsWith("replay")) replays.push(battle)
        console.log(replays);
        localStorage.setItem("replays",JSON.stringify(replays));
        console.log(localStorage.getItem("replays"));
        window.location.href = "/simulator.html";
    }


	if (event.data.startsWith("%")) {
		let data1 = event.data;
		let data = data1.split("%");
		

		switch (data[1]) {

            case "nobattle" : {
				let battles = JSON.parse(localStorage.getItem("battles"))
				if(battles) {
				for(let i = 0;i < battles.length;i++) {
					
					if(battles[i]) { 
						if(battles[i].endsWith(data[2])) battles[i] = null;
					}
				}
				localStorage.setItem("battles",JSON.stringify(battles))
			}
                console.log("Battle Code (" + data[2] + ")" + " is invalid or expired");
            }
            break;

			case "noreplay" : {
				let replays = JSON.parse(localStorage.getItem("replays"))
				if(battles) {
				for(let i = 0;i < battles.length;i++) {
					
					if(battles[i]) { 
						if(battles[i].endsWith(data[2])) battles[i] = null;
					}
				}
				localStorage.setItem("replays",JSON.stringify(battles))
			}
                alert("Replay  (" + data[2] + ")" + " does not exist");
            }
            break;

			case "loginfail":
				{
					let name = document.getElementById("code").value.trim();
					let pass = document.getElementById("pass").value;
					if (data[2].includes("exist")) {
						let y = confirm(
							`User (${name} is not registered, Would you like to register with same details?`
						);
						if (y) return ws.send(`%signup%${name}%${pass}`);
						return;
					}

					alert(data[2]);
				}
				break;

			case "login":
				{
					let name = document.getElementById("code").value.trim();
					localStorage.setItem("token", data[2]);
					ws.send("%validateToken%" + name + "%" + data[2]);
					console.log(localStorage.getItem("token"));
				}
				break;

			case "tokenexpired":
				{
					localStorage.removeItem("token");
					console.log("Session expired, Please login again");
				}
				break;

			
				case "sessionexpired" : {
					localStorage.removeItem("token");
					localStorage.removeItem("user")
					alert("Invalid Session : Account has been logged in somewhere")
					setTimeout(() => {
						window.location.href = "/";
					},1500)
							return;
				}
				
			case "tokenverified":
				{
					window.location.href = "index.html"
					console.log(data[2]);
				}
				break;

				case "userdata":
					{
						console.log(data[2]);
						localStorage.setItem("user",data[2]);
						//window.location.hrefwindow.location.href = "home.html"
					}
					break;

					case "logout":
					{
						console.log(data[2]);
						window.location.reload();
						localStorage.removeItem("user");
						localStorage.removeItem("token");
						localStorage.removeItem("parts");

					}
					break;
		}
	}
};
