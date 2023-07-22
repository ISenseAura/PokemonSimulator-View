var url = "ws://" + Config.defaultserver.host + ":" + Config.defaultserver.port;

var ws =  new WebSocket(url);
console.log(Config);


ws.onopen = (event) => {
	console.log("Testt")
	
	ws.send("Here's some text that the server is urgently awaiting!");
    if(localStorage.getItem("token")) ws.send("%getuser%" + localStorage.getItem("token"));
	if(localStorage.getItem("battles")) {
		let battles = JSON.parse(localStorage.getItem("battles"))
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
        
        console.log(localStorage.getItem("battles"));

        let battles = localStorage.getItem("battles") ? JSON.parse(localStorage.getItem("battles")) : [];
        if(!battles.includes(battle)) battles.push(battle)
        console.log(battles);
        localStorage.setItem("battles",JSON.stringify(battles));
        console.log(localStorage.getItem("battles"));
        window.location.href = "http://127.0.0.1:5502/simulator.html";
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
                alert("Battle Code (" + data[2] + ")" + " is invalid or expired");
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

			case "tokenverified":
				{
					window.location.href = "home.html"
					console.log(data[2]);
				}
				break;

				case "userdata":
					{
						console.log(data[2]);
						localStorage.setItem("user",data[2]);
					}
					break;

					case "logout":
					{
						console.log(data[2]);
						window.location.reload();
						localStorage.removeItem("user");
						localStorage.removeItem("token");

					}
					break;
		}
	}
};
