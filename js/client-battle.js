var app = {
	name : "Mayuuurrr",
	user : {
		name : "Mayurrr",
		get : function (a) {return true;}
	}
};

var Room = Backbone.View.extend({
	className: 'ps-room',
	constructor: function (options) {
		if (!this.events) this.events = {};
		if (!this.events['click button']) this.events['click button'] = 'dispatchClickButton';
		if (!this.events['click']) this.events['click'] = 'dispatchClickBackground';

		Backbone.View.apply(this, arguments);

		if (!(options && options.nojoin)) this.join();
		if (options && options.title) this.title = options.title;
		this.el.id = 'room-' + this.id;
	},
	dispatchClickButton: function (e) {
		var target = e.currentTarget;
		if (target.name) {
			app.dismissingSource = app.dismissPopups();
			app.dispatchingButton = target;
			e.preventDefault();
			e.stopImmediatePropagation();
			this[target.name](target.value, target);
			delete app.dismissingSource;
			delete app.dispatchingButton;
		}
	},
	dispatchClickBackground: function (e) {
		app.dismissPopups();
		if (e.shiftKey || (window.getSelection && !window.getSelection().isCollapsed)) {
			return;
		}
		this.focus(e);
	},

	// communication

	/**
	 * Send to sim server
	 */
	send: function (data) {
		app.send(data, this.id);
	},
	/**
	 * Receive from sim server
	 */
	receive: function (data) {
		//
	},

	// layout

	bestWidth: 659,
	show: function (position, leftWidth) {
		this.leftWidth = 0;
		switch (position) {
		case 'left':
			this.$el.css({left: 0, width: leftWidth, right: 'auto'});
			break;
		case 'right':
			this.$el.css({left: leftWidth + 1, width: 'auto', right: 0});
			this.leftWidth = leftWidth;
			break;
		case 'full':
			this.$el.css({left: 0, width: 'auto', right: 0});
			break;
		}
		this.$el.show();
		this.dismissAllNotifications(true);
	},
	hide: function () {
		this.blur();
		this.$el.hide();
	},
	focus: function () {},
	blur: function () {},
	join: function () {},
	leave: function () {},

	// notifications

	requestNotifications: function () {
		try {
			if (window.webkitNotifications && webkitNotifications.requestPermission) {
				// Notification.requestPermission crashes Chrome 23:
				//   https://code.google.com/p/chromium/issues/detail?id=139594
				// In lieu of a way to detect Chrome 23, we'll just use the old
				// requestPermission API, which works to request permissions for
				// the new Notification spec anyway.
				webkitNotifications.requestPermission();
			} else if (window.Notification && Notification.requestPermission) {
				Notification.requestPermission(function (permission) {});
			}
		} catch (e) {}
	},
	notificationClass: '',
	notifications: null,
	subtleNotification: false,
	notify: function (title, body, tag, once) {
		if (once && app.focused && (this === app.curRoom || this == app.curSideRoom)) return;
		if (!tag) tag = 'message';
		var needsTabbarUpdate = false;
		if (!this.notifications) {
			this.notifications = {};
			needsTabbarUpdate = true;
		}
		if (app.focused && (this === app.curRoom || this == app.curSideRoom)) {
			this.notifications[tag] = {};
		} else if (window.nodewebkit && !nwWindow.setBadgeLabel) {
			// old desktop client
			// note: window.Notification exists but does nothing
			nwWindow.requestAttention(true);
		} else if (window.Notification) {
			// old one doesn't need to be closed; sending the tag should
			// automatically replace the old notification
			try {
				var notification = this.notifications[tag] = new Notification(title, {
					lang: 'en',
					body: body,
					tag: this.id + ':' + tag
				});
				var self = this;
				notification.onclose = function () {
					self.dismissNotification(tag);
				};
				notification.onclick = function () {
					window.focus();
					self.clickNotification(tag);
				};
				if (Dex.prefs('temporarynotifications')) {
					if (notification.cancel) {
						setTimeout(function () {notification.cancel();}, 5000);
					} else if (notification.close) {
						setTimeout(function () {notification.close();}, 5000);
					}
				}
				if (once) notification.psAutoclose = true;
			} catch (e) {
				// Chrome mobile will leave Notification in existence but throw if you try to use it
			}
			needsTabbarUpdate = true;
		} else if (window.macgap) {
			macgap.growl.notify({
				title: title,
				content: body
			});
			var notification = {};
			this.notifications[tag] = notification;
			if (once) notification.psAutoclose = true;
		} else {
			var notification = {};
			this.notifications[tag] = notification;
			if (once) notification.psAutoclose = true;
		}
		if (needsTabbarUpdate) {
			this.notificationClass = ' notifying';
			app.topbar.updateTabbar();
		}
	},
	subtleNotifyOnce: function () {
		if (app.focused && (this === app.curRoom || this == app.curSideRoom)) return;
		if (this.notifications || this.subtleNotification) return;
		this.subtleNotification = true;
		this.notificationClass = ' subtle-notifying';
		app.topbar.updateTabbar();
	},
	notifyOnce: function (title, body, tag) {
		return this.notify(title, body, tag, true);
	},
	closeNotification: function (tag, alreadyClosed) {
		if (!tag) return this.closeAllNotifications();
		if (window.nodewebkit) nwWindow.requestAttention(false);
		if (!this.notifications || !this.notifications[tag]) return;
		if (!alreadyClosed) {
			try {
				// Edge will expose a close function and crash when you try to use it
				// It seems to be a permission error - sometimes it crashes, sometimes
				// it doesn't.
				// "Unexpected call to method or property access"
				this.notifications[tag].close();
			} catch (err) {}
		}
		delete this.notifications[tag];
		if (_.isEmpty(this.notifications)) {
			this.notifications = null;
			this.notificationClass = (this.subtleNotification ? ' subtle-notifying' : '');
			app.topbar.updateTabbar();
		}
	},
	closeAllNotifications: function (skipUpdate) {
		if (!this.notifications && !this.subtleNotification) {
			return;
		}
		if (window.nodewebkit) nwWindow.requestAttention(false);
		this.subtleNotification = false;
		if (this.notifications) {
			for (var tag in this.notifications) {
				try {
					// Edge bug? - see closeNotification
					this.notifications[tag].close();
				} catch (err) {}
			}
			this.notifications = null;
		}
		this.notificationClass = '';
		if (skipUpdate) return;
		app.topbar.updateTabbar();
	},
	dismissNotification: function (tag) {
		if (!tag) return this.dismissAllNotifications();
		if (window.nodewebkit) nwWindow.requestAttention(false);
		if (!this.notifications || !this.notifications[tag]) return;
		try {
			// Edge bug? - see closeNotification
			this.notifications[tag].close();
		} catch (err) {}
		if (!this.notifications || this.notifications[tag]) return; // avoid infinite recursion
		if (this.notifications[tag].psAutoclose) {
			delete this.notifications[tag];
			if (!this.notifications || _.isEmpty(this.notifications)) {
				this.notifications = null;
				this.notificationClass = (this.subtleNotification ? ' subtle-notifying' : '');
				app.topbar.updateTabbar();
			}
		} else {
			this.notifications[tag] = {};
		}

		if (this.lastMessageDate) {
			// Mark chat messages as read to avoid double-notifying on reload
			var lastMessageDates = Dex.prefs('logtimes') || (Storage.prefs('logtimes', {}), Dex.prefs('logtimes'));
			if (!lastMessageDates[Config.server.id]) lastMessageDates[Config.server.id] = {};
			lastMessageDates[Config.server.id][this.id] = this.lastMessageDate;
			Storage.prefs.save();
		}
	},
	dismissAllNotifications: function (skipUpdate) {
		if (!this.notifications && !this.subtleNotification) {
			return;
		}
		if (window.nodewebkit) nwWindow.requestAttention(false);
		this.subtleNotification = false;
		if (this.notifications) {
			for (var tag in this.notifications) {
				if (!this.notifications[tag].psAutoclose) continue;
				try {
					// Edge bug? - see closeNotification
					this.notifications[tag].close();
				} catch (err) {}
				delete this.notifications[tag];
			}
			if (!this.notifications || _.isEmpty(this.notifications)) {
				this.notifications = null;
			}
		}
		if (!this.notifications) {
			this.notificationClass = '';
			if (!skipUpdate) app.topbar.updateTabbar();
		}

		if (this.lastMessageDate) {
			// Mark chat messages as read to avoid double-notifying on reload
			var lastMessageDates = Dex.prefs('logtimes') || (Storage.prefs('logtimes', {}), Dex.prefs('logtimes'));
			if (!lastMessageDates[Config.server.id]) lastMessageDates[Config.server.id] = {};
			lastMessageDates[Config.server.id][this.id] = this.lastMessageDate;
			Storage.prefs.save();
		}
	},
	clickNotification: function (tag) {
		this.dismissNotification(tag);
		app.focusRoom(this.id);
	},
	close: function () {
		app.leaveRoom(this.id);
	},

	// allocation

	destroy: function (alreadyLeft) {
		this.closeAllNotifications(true);
		if (!alreadyLeft) this.leave();
		this.remove();
		delete this.app;
	}
});

(function ($) {

	var ConsoleRoom = this.ConsoleRoom = Room.extend({
		type: 'chat',
		title: '',
		constructor: function () {
			if (!this.events) this.events = {};
			if (!this.events['click .username']) this.events['click .username'] = 'clickUsername';
			if (!this.events['submit form']) this.events['submit form'] = 'submit';
			if (!this.events['keydown textarea']) this.events['keydown textarea'] = 'keyDown';
			if (!this.events['keyup textarea']) this.events['keyup textarea'] = 'keyUp';
			if (!this.events['focus textarea']) this.events['focus textarea'] = 'focusText';
			if (!this.events['blur textarea']) this.events['blur textarea'] = 'blurText';
			if (!this.events['click .spoiler']) this.events['click .spoiler'] = 'clickSpoiler';
			if (!this.events['click .message-pm i']) this.events['click .message-pm i'] = 'openPM';

			this.initializeTabComplete();
			// create up/down history for this room
			this.chatHistory = new ChatHistory();

			// this MUST set up this.$chatAdd
			Room.apply(this, arguments);

			//app.user.on('change', this.updateUser, this);
			this.updateUser();
		},
		updateUser: function () {
			var name = app.user.get('name');
			if (this.expired) {
				this.$chatAdd.html(this.expired === true ? 'This room is expired' : BattleLog.sanitizeHTML(this.expired));
				this.$chatbox = null;
			} else if (!name) {
				this.$chatAdd.html('Connecting...');
				this.$chatbox = null;
			} else if (!app.user.get('named')) {
				this.$chatAdd.html('<form><button name="login">Join chat</button></form>');
				this.$chatbox = null;
			} else {
				var color = app.user.get('away') ? 'color:#888;' : BattleLog.hashColor(app.user.get('userid'));
				this.$chatAdd.html('<form class="chatbox"><label style="' + color + '">' + BattleLog.escapeHTML(name) + ':</label> <textarea class="textbox" type="text" size="70" autocomplete="off"></textarea></form>');
				this.$chatbox = this.$chatAdd.find('textarea');
				this.$chatbox.autoResize({
					animate: false,
					extraSpace: 0
				});
				if (document.activeElement.tagName.toLowerCase() !== 'textarea' && (this === app.curSideRoom || this === app.curRoom)) {
					this.$chatbox.focus();
				}
			}
		},

		focus: function (e, focusTextbox) {
			var target = e && e.target;
			if (target && ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)) {
				// this workaround works for iOS 12 but not iOS 13
				/* if (window.isiOS) {
					// iOS will not bring up a keyboard unless you manually blur and refocus
					$(target).blur();
					setTimeout(function () {
						$(target).focus();
					}, 0);
				} */
				return;
			}
			if (!this.$chatbox) {
				this.$('button[name=login]').focus();
				return;
			}
			if (focusTextbox || $(target).closest('.chat-log-add, .battle-log-add').length) {
				this.$chatbox.focus();
				return;
			}

			if (window.isiOS) {
				// Preventing the on-screen keyboard leads to other bugs, so we have to
				// avoid focusing the textbox altogether. Sorry, Bluetooth keyboard users!
				return;
			}
			// this will prevent a on-screen keyboard from appearing (in Android and iOS,
			// and hopefully also Windows and Chrome OS in tablet mode)
			this.$chatbox.blur();
			this.$chatbox[0].readOnly = true;
			this.$chatbox.focus();
			var chatbox = this.$chatbox[0];
			setTimeout(function () {
				chatbox.readOnly = false;
			}, 0);
		},

		focusText: function () {
			if (this.$chatbox) {
				var rooms = app.roomList.concat(app.sideRoomList);
				var roomIndex = rooms.indexOf(this);
				var roomLeft = rooms[roomIndex - 1];
				var roomRight = rooms[roomIndex + 1];
				if (roomLeft || roomRight) {
					this.$chatbox.attr('placeholder', "  " + (roomLeft ? "\u2190 " + roomLeft.title : '') + (app.arrowKeysUsed ? " | " : " (use arrow keys) ") + (roomRight ? roomRight.title + " \u2192" : ''));
				} else {
					this.$chatbox.attr('placeholder', "");
				}
			}
		},
		blurText: function () {
			if (this.$chatbox) {
				this.$chatbox.attr('placeholder', "");
			}
		},
		clickSpoiler: function (e) {
			$(e.currentTarget).toggleClass('spoiler-shown');
		},

		login: function () {
			app.addPopup(LoginPopup);
		},
		submit: function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (e.currentTarget.getAttribute('data-submitsend')) {
				return app.submitSend(e);
			}
			var text = this.$chatbox.val();
			if (!text) return;
			if (!$.trim(text)) {
				this.$chatbox.val('');
				return;
			}
			this.tabComplete.reset();
			this.chatHistory.push(text);
			text = this.parseCommand(text);
			if (
				this.battle && this.battle.ignoreSpects &&
				app.user.get('userid') !== this.battle.p1.id && app.user.get('userid') !== this.battle.p2.id &&
				!(text.startsWith('/') && !text.startsWith('/me'))
			) {
				this.add("You can't chat in this battle as you're currently ignoring spectators");
			} else if (text.length > 80000) {
				app.addPopupMessage("Your message is too long.");
				return;
			} else if (text) {
				this.send(text);
			}
			this.$chatbox.val('');
			this.$chatbox.trigger('keyup'); // force a resize
		},
		keyUp: function (e) {
			// Android Chrome compose keycode
			// Android Chrome no longer sends keyCode 13 when Enter is pressed on
			// the soft keyboard, resulting in this annoying hack.
			// https://bugs.chromium.org/p/chromium/issues/detail?id=118639#c232
			if (!e.shiftKey && e.keyCode === 229 && this.$chatbox.val().slice(-1) === '\n') {
				this.submit(e);
			}
		},
		keyDown: function (e) {
			var cmdKey = (((e.cmdKey || e.metaKey) ? 1 : 0) + (e.ctrlKey ? 1 : 0) === 1) && !e.altKey && !e.shiftKey;
			var textbox = e.currentTarget;
			if (e.keyCode === 13 && !e.shiftKey) { // Enter key
				this.submit(e);
			} else if (e.keyCode === 73 && cmdKey) { // Ctrl + I key
				if (ConsoleRoom.toggleFormatChar(textbox, '_')) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 66 && cmdKey) { // Ctrl + B key
				if (ConsoleRoom.toggleFormatChar(textbox, '*')) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 192 && cmdKey) { // Ctrl + ` key
				if (ConsoleRoom.toggleFormatChar(textbox, '`')) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 33) { // Pg Up key
				this.$chatFrame.scrollTop(this.$chatFrame.scrollTop() - this.$chatFrame.height() + 60);
			} else if (e.keyCode === 34) { // Pg Dn key
				this.$chatFrame.scrollTop(this.$chatFrame.scrollTop() + this.$chatFrame.height() - 60);
			} else if (e.keyCode === 9 && !e.ctrlKey) { // Tab key
				var reverse = !!e.shiftKey; // Shift+Tab reverses direction
				if (this.handleTabComplete(this.$chatbox, reverse)) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 38 && !e.shiftKey && !e.altKey) { // Up key
				if (this.chatHistoryUp(this.$chatbox, e)) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 40 && !e.shiftKey && !e.altKey) { // Down key
				if (this.chatHistoryDown(this.$chatbox, e)) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === 27 && !e.shiftKey && !e.altKey) { // Esc key
				if (this.undoTabComplete(this.$chatbox)) {
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (app.user.lastPM && (textbox.value === '/reply' || textbox.value === '/r' || textbox.value === '/R') && e.keyCode === 32) { // '/reply ' is being written
				e.preventDefault();
				e.stopPropagation();
				var val = '/pm ' + app.user.lastPM + ', ';
				textbox.value = val;
				textbox.setSelectionRange(val.length, val.length);
			}
		},
		clickUsername: function (e) {
			e.stopPropagation();
			e.preventDefault();
			var position;
			if (e.currentTarget.className === 'userbutton username') {
				position = 'right';
			}
			var roomGroup = $(e.currentTarget).data('roomgroup');
			var name = $(e.currentTarget).data('name') || $(e.currentTarget).text();
			var away = $(e.currentTarget).data('away') || false;
			var status = $(e.currentTarget).data('status');
			app.addPopup(UserPopup, {roomGroup: roomGroup, name: name, away: away, status: status, sourceEl: e.currentTarget, position: position});
		},
		openPM: function (e) {
			e.preventDefault();
			e.stopPropagation();
			app.focusRoom('');
			app.rooms[''].focusPM($(e.currentTarget).data('name'));
		},
		clear: function () {
			if (this.$chat) this.$chat.html('');
		},

		// support for buttons that can be sent by the server:

		joinRoom: function (room) {
			app.joinRoom(room);
		},
		avatars: function () {
			app.addPopup(AvatarsPopup);
		},
		openSounds: function () {
			app.addPopup(SoundsPopup, {type: 'semimodal'});
		},
		openOptions: function () {
			app.addPopup(OptionsPopup, {type: 'semimodal'});
		},

		// highlight

		getHighlight: function (message) {
			var highlights = Dex.prefs('highlights') || {};
			if (Array.isArray(highlights)) {
				highlights = {global: highlights};
				// Migrate from the old highlight system
				Storage.prefs('highlights', highlights);
			}
			if (!Dex.prefs('noselfhighlight') && app.user.nameRegExp) {
				if (app.user.nameRegExp.test(message)) return true;
			}
			if (!app.highlightRegExp) {
				try {
					this.updateHighlightRegExp(highlights);
				} catch (e) {
					// If the expression above is not a regexp, we'll get here.
					// Don't throw an exception because that would prevent the chat
					// message from showing up, or, when the lobby is initialising,
					// it will prevent the initialisation from completing.
					return false;
				}
			}
			var id = Config.server.id + '#' + this.id;
			var globalHighlightsRegExp = app.highlightRegExp['global'];
			var roomHighlightsRegExp = app.highlightRegExp[id];
			return (((globalHighlightsRegExp && globalHighlightsRegExp.test(message)) || (roomHighlightsRegExp && roomHighlightsRegExp.test(message))));
		},
		updateHighlightRegExp: function (highlights) {
			// Enforce boundary for match sides, if a letter on match side is
			// a word character. For example, regular expression "a" matches
			// "a", but not "abc", while regular expression "!" matches
			// "!" and "!abc".
			app.highlightRegExp = {};
			for (var i in highlights) {
				if (!highlights[i].length) {
					app.highlightRegExp[i] = null;
					continue;
				}
				app.highlightRegExp[i] = new RegExp('(?:\\b|(?!\\w))(?:' + highlights[i].join('|') + ')(?:\\b|(?!\\w))', 'i');
			}
		},

		// chat history

		chatHistory: null,
		chatHistoryUp: function ($textbox, e) {
			var idx = +$textbox.prop('selectionStart');
			var line = $textbox.val();
			if (e && !e.ctrlKey && idx !== 0 && idx !== line.length) return false;
			if (this.chatHistory.index === 0) return false;
			$textbox.val(this.chatHistory.up(line));
			return true;
		},
		chatHistoryDown: function ($textbox, e) {
			var idx = +$textbox.prop('selectionStart');
			var line = $textbox.val();
			if (e && !e.ctrlKey && idx !== 0 && idx !== line.length) return false;
			$textbox.val(this.chatHistory.down(line));
			return true;
		},

		// tab completion

		initializeTabComplete: function () {
			this.tabComplete = {
				candidates: null,
				index: 0,
				prefix: null,
				cursor: null,
				reset: function () {
					this.cursor = null;
				}
			};
			this.userActivity = [];
		},
		markUserActive: function (userid) {
			var idx = this.userActivity.indexOf(userid);
			if (idx !== -1) {
				this.userActivity.splice(idx, 1);
			}
			this.userActivity.push(userid);
			if (this.userActivity.length > 100) {
				// Prune the list.
				this.userActivity.splice(0, 20);
			}
		},
		tabComplete: null,
		userActivity: null,
		handleTabComplete: function ($textbox, reverse) {
			// Don't tab complete at the start of the text box.
			var idx = $textbox.prop('selectionStart');
			if (idx === 0) return false;

			var users = this.users || (app.rooms['lobby'] ? app.rooms['lobby'].users : {});

			var text = $textbox.val();
			var prefix = text.substr(0, idx);

			if (this.tabComplete.cursor !== null && prefix === this.tabComplete.cursor) {
				// The user is cycling through the candidate names.
				if (reverse) {
					this.tabComplete.index--;
				} else {
					this.tabComplete.index++;
				}
				if (this.tabComplete.index >= this.tabComplete.candidates.length) this.tabComplete.index = 0;
				if (this.tabComplete.index < 0) this.tabComplete.index = this.tabComplete.candidates.length - 1;
			} else {
				// This is a new tab completion.

				// There needs to be non-whitespace to the left of the cursor.
				var m1 = /^([\s\S]*?)([A-Za-z0-9][^, \n]*)$/.exec(prefix);
				var m2 = /^([\s\S]*?)([A-Za-z0-9][^, \n]* [^, ]*)$/.exec(prefix);
				if (!m1 && !m2) return true;

				this.tabComplete.prefix = prefix;
				var idprefix = (m1 ? toID(m1[2]) : '');
				var spaceprefix = (m2 ? m2[2].replace(/[^A-Za-z0-9 ]+/g, '').toLowerCase() : '');
				var candidates = []; // array of [candidate userid, prefix length]

				// don't include command names in autocomplete
				if (m2 && (m2[0] === '/' || m2[0] === '!')) spaceprefix = '';

				for (var i in users) {
					if (spaceprefix && users[i].name.replace(/[^A-Za-z0-9 ]+/g, '').toLowerCase().substr(0, spaceprefix.length) === spaceprefix) {
						candidates.push([i, m2[1].length]);
					} else if (idprefix && i.substr(0, idprefix.length) === idprefix) {
						candidates.push([i, m1[1].length]);
					}
				}

				// Sort by most recent to speak in the chat, or, in the case of a tie,
				// in alphabetical order.
				var self = this;
				candidates.sort(function (a, b) {
					if (a[1] !== b[1]) {
						// shorter prefix length comes first
						return a[1] - b[1];
					}
					var aidx = self.userActivity.indexOf(a[0]);
					var bidx = self.userActivity.indexOf(b[0]);
					if (aidx !== -1) {
						if (bidx !== -1) {
							return bidx - aidx;
						}
						return -1; // a comes first
					} else if (bidx != -1) {
						return 1; // b comes first
					}
					return (a[0] < b[0]) ? -1 : 1; // alphabetical order
				});
				this.tabComplete.candidates = candidates;
				this.tabComplete.index = 0;
				if (!candidates.length) {
					this.tabComplete.cursor = null;
					return true;
				}
			}

			// Substitute in the tab-completed name.
			var candidate = this.tabComplete.candidates[this.tabComplete.index];
			var substituteUserId = candidate[0];
			var substituteUser = users[substituteUserId];
			if (!substituteUser) return true;
			var name = substituteUser.name;
			name = Dex.getShortName(name);
			var fullPrefix = this.tabComplete.prefix.substr(0, candidate[1]) + name;
			$textbox.val(fullPrefix + text.substr(idx));
			var pos = fullPrefix.length;
			$textbox[0].setSelectionRange(pos, pos);
			this.tabComplete.cursor = fullPrefix;
			return true;
		},
		undoTabComplete: function ($textbox) {
			var cursorPosition = $textbox.prop('selectionEnd');
			if (!this.tabComplete.cursor || $textbox.val().substr(0, cursorPosition) !== this.tabComplete.cursor) return false;
			$textbox.val(this.tabComplete.prefix + $textbox.val().substr(cursorPosition));
			$textbox.prop('selectionEnd', this.tabComplete.prefix.length);
			return true;
		},

		// command parsing
		checkBroadcast: function (cmd, text) {
			if (text.charAt(0) === '!') {
				this.add('|error|The command "!' + cmd + '" cannot be broadcast.');
				this.add('|error|Use /' + cmd + ' to use it normally.');
				return true;
			}
			return false;
		},
		parseCommand: function (text) {
			var cmd = '';
			var target = '';
			var noSpace = false;
			if (text.substr(0, 2) !== '//' && text.charAt(0) === '/' || text.charAt(0) === '!') {
				var spaceIndex = text.indexOf(' ');
				if (spaceIndex > 0) {
					cmd = text.substr(1, spaceIndex - 1);
					target = text.substr(spaceIndex + 1).trim();
				} else {
					cmd = text.substr(1);
					target = '';
					noSpace = true;
				}
			}

			switch (toID(cmd)) {
			case 'chal':
			case 'chall':
			case 'challenge':
				if (this.checkBroadcast(cmd, text)) return false;
				var targets = target.split(',');
				for (var i = 0; i < targets.length; i++) {
					targets[i] = $.trim(targets[i]);
				}

				var self = this;
				var challenge = function (targets) {
					target = toID(targets[0]);
					self.challengeData = {userid: target, format: targets.length > 1 ? targets.slice(1).join(',') : '', team: ''};
					app.on('response:userdetails', self.challengeUserdetails, self);
					app.send('/cmd userdetails ' + target);
				};

				if (!targets[0]) {
					app.addPopupPrompt("Who would you like to challenge?", "Challenge user", function (target) {
						if (!target) return;
						challenge([target]);
					});
					return false;
				}
				challenge(targets);
				return false;

			case 'accept':
				if (this.checkBroadcast(cmd, text)) return false;
				var userid = toID(target);
				if (userid) {
					var $challenge = $('.pm-window').filter('div[data-userid="' + userid + '"]').find('button[name="acceptChallenge"]');
					if (!$challenge.length) {
						this.add("You do not have any pending challenge from '" + toName(target) + "' to accept.");
						return false;
					}
					$challenge[0].click();
					return false;
				}

				var $challenges = $('.challenge').find('button[name=acceptChallenge]');
				if (!$challenges.length) {
					this.add('You do not have any pending challenges to accept.');
					return false;
				}
				if ($challenges.length > 1) {
					this.add('You need to specify a user if you have more than one pending challenge to accept.');
					this.parseCommand('/help accept');
					return false;
				}

				$challenges[0].click();
				return false;
			case 'reject':
				if (this.checkBroadcast(cmd, text)) return false;
				var userid = toID(target);
				if (userid) {
					var $challenge = $('.pm-window').filter('div[data-userid="' + userid + '"]').find('button[name="rejectChallenge"]');
					if (!$challenge.length) {
						this.add("You do not have any pending challenge from '" + toName(target) + "' to reject.");
						return false;
					}
					$challenge[0].click();
					return false;
				}

				var $challenges = $('.challenge').find('button[name="rejectChallenge"]');
				if (!$challenges.length) {
					this.add('You do not have any pending challenges to reject.');
					this.parseCommand('/help reject');
					return false;
				}
				if ($challenges.length > 1) {
					this.add('You need to specify a user if you have more than one pending challenge to reject.');
					this.parseCommand('/help reject');
					return false;
				}

				$challenges[0].click();
				return false;

			case 'user':
			case 'open':
				if (this.checkBroadcast(cmd, text)) return false;
				var openUser = function (target) {
					app.addPopup(UserPopup, {name: target});
				};
				target = toName(target);
				if (!target) {
					app.addPopupPrompt("Username", "Open", function (target) {
						if (!target) return;
						openUser(target);
					});
					return false;
				}
				openUser(target);
				return false;

			case 'pm':
			case 'whisper':
			case 'w':
			case 'msg':
				if (this.checkBroadcast(cmd, text)) return false;
				var commaIndex = target.indexOf(',');
				if (commaIndex < 0) break;
				if (!$.trim(target.slice(commaIndex + 1))) {
					app.rooms[''].focusPM(target.slice(0, commaIndex));
					return false;
				}
				break;

			case 'debug':
				if (this.checkBroadcast(cmd, text)) return false;
				if (target === 'extractteams') {
					app.addPopup(Popup, {
						type: 'modal',
						htmlMessage: "Extracted team data:<br /><textarea rows=\"10\" cols=\"60\">" + BattleLog.escapeHTML(JSON.stringify(Storage.teams)) + "</textarea>"
					});
				} else if (target === 'nw') {
					try {
						nw.Window.get().showDevTools();
					} catch (e) {
						this.add('|error|' + e.message);
					}
				} else {
					this.add('|error|Unknown debug command.');
					this.add('|error|Are you looking for /showdebug and /hidedebug?');
				}
				return false;

			case 'news':
				if (this.checkBroadcast(cmd, text)) return false;
				app.rooms[''].addNews();
				return false;
			case 'autojoin':
			case 'cmd':
			case 'crq':
			case 'query':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('This is a PS system command; do not use it.');
				return false;

			case 'ignore':
				if (this.checkBroadcast(cmd, text)) return false;
				if (!target) {
					this.parseCommand('/help ignore');
					return false;
				}
				if (toUserid(target) === app.user.get('userid')) {
					this.add("You are not able to ignore yourself.");
				} else if (app.ignore[toUserid(target)]) {
					this.add("User '" + toName(target) + "' is already on your ignore list. (Moderator messages will not be ignored.)");
				} else {
					app.ignore[toUserid(target)] = 1;
					this.add("User '" + toName(target) + "' ignored. (Moderator messages will not be ignored.)");
					app.saveIgnore();
				}
				return false;

			case 'clearignore':
				if (this.checkBroadcast(cmd, text)) return false;
				if (toID(target) !== 'confirm') {
					this.add("Are you sure you want to clear your ignore list?");
					this.add('|html|If you\'re sure, use <code>/clearignore confirm</code>');
					return false;
				}
				if (!Object.keys(app.ignore).length) {
					this.add("You have no ignored users.");
					return false;
				}
				app.ignore = {};
				app.saveIgnore();
				this.add("Your ignore list was cleared.");
				return false;
			case 'unignore':
				if (this.checkBroadcast(cmd, text)) return false;
				if (!target) {
					this.parseCommand('/help unignore');
					return false;
				}
				if (!app.ignore[toUserid(target)]) {
					this.add("User '" + toName(target) + "' isn't on your ignore list.");
				} else {
					delete app.ignore[toUserid(target)];
					this.add("User '" + toName(target) + "' no longer ignored.");
					app.saveIgnore();
				}
				return false;

			case 'ignorelist':
				if (this.checkBroadcast(cmd, text)) return false;
				var ignoreList = Object.keys(app.ignore);
				if (ignoreList.length === 0) {
					this.add('You are currently not ignoring anyone.');
				} else {
					this.add("You are currently ignoring: " + ignoreList.join(', '));
				}
				return false;

			case 'clear':
				if (this.checkBroadcast(cmd, text)) return false;
				if (this.clear) {
					this.clear();
				} else {
					this.add('||This room can\'t be cleared');
				}
				return false;

			case 'clearpms':
				if (this.checkBroadcast(cmd, text)) return false;
				var $pms = $('.pm-window');
				if (!$pms.length) {
					this.add('You do not have any PM windows open.');
					return false;
				}
				$pms.each(function () {
					var userid = $(this).data('userid');
					if (!userid) {
						var newsId = $(this).data('newsid');
						if (newsId) {
							$.cookie('showdown_readnews', '' + newsId, {expires: 365});
						}
						$(this).remove();
						return;
					}
					app.rooms[''].closePM(userid);
					$(this).find('.inner').empty();
				});
				this.add("All PM windows cleared and closed.");
				return false;

			case 'nick':
				if (this.checkBroadcast(cmd, text)) return false;
				if ($.trim(target)) {
					app.user.rename(target);
				} else {
					app.addPopup(LoginPopup);
				}
				return false;

			case 'logout':
				if (this.checkBroadcast(cmd, text)) return false;
				app.user.logout();
				return false;
			case 'showdebug':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Debug battle messages: ON');
				Storage.prefs('showdebug', true);
				var debugStyle = $('#debugstyle').get(0);
				var onCSS = '.debug {display: block;}';
				if (!debugStyle) {
					$('head').append('<style id="debugstyle">' + onCSS + '</style>');
				} else {
					debugStyle.innerHTML = onCSS;
				}
				return false;
			case 'hidedebug':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Debug battle messages: HIDDEN');
				Storage.prefs('showdebug', false);
				var debugStyle = $('#debugstyle').get(0);
				var offCSS = '.debug {display: none;}';
				if (!debugStyle) {
					$('head').append('<style id="debugstyle">' + offCSS + '</style>');
				} else {
					debugStyle.innerHTML = offCSS;
				}
				return false;

			case 'showjoins':
				if (this.checkBroadcast(cmd, text)) return false;
				var showjoins = Dex.prefs('showjoins') || {};
				var serverShowjoins = showjoins[Config.server.id] || {};
				if (target) {
					var room = toID(target);
					if (serverShowjoins['global']) {
						delete serverShowjoins[room];
					} else {
						serverShowjoins[room] = 1;
					}
					this.add('Join/leave messages on room ' + room + ': ALWAYS ON');
				} else {
					serverShowjoins = {global: 1};
					this.add('Join/leave messages: ALWAYS ON');
				}
				showjoins[Config.server.id] = serverShowjoins;
				Storage.prefs('showjoins', showjoins);
				return false;
			case 'hidejoins':
				if (this.checkBroadcast(cmd, text)) return false;
				var showjoins = Dex.prefs('showjoins') || {};
				var serverShowjoins = showjoins[Config.server.id] || {};
				if (target) {
					var room = toID(target);
					if (!serverShowjoins['global']) {
						delete serverShowjoins[room];
					} else {
						serverShowjoins[room] = 0;
					}
					this.add('Join/leave messages on room ' + room + ': AUTOMATIC');
				} else {
					serverShowjoins = {global: 0};
					this.add('Join/leave messages: AUTOMATIC');
				}
				showjoins[Config.server.id] = serverShowjoins;
				Storage.prefs('showjoins', showjoins);
				return false;

			case 'showbattles':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Battle messages: ON');
				Storage.prefs('showbattles', true);
				return false;
			case 'hidebattles':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Battle messages: HIDDEN');
				Storage.prefs('showbattles', false);
				return false;

			case 'unpackhidden':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Locked/banned users\' chat messages: ON');
				Storage.prefs('nounlink', true);
				return false;
			case 'packhidden':
				if (this.checkBroadcast(cmd, text)) return false;
				this.add('Locked/banned users\' chat messages: HIDDEN');
				Storage.prefs('nounlink', false);
				return false;

			case 'timestamps':
				if (this.checkBroadcast(cmd, text)) return false;
				var targets = target.split(',');
				if ((['all', 'lobby', 'pms'].indexOf(targets[0]) === -1) || targets.length < 2 ||
					(['off', 'minutes', 'seconds'].indexOf(targets[1] = targets[1].trim()) === -1)) {
					this.add('Error: Invalid /timestamps command');
					this.parseCommand('/help timestamps'); // show help
					return false;
				}
				var timestamps = Dex.prefs('timestamps') || {};
				if (typeof timestamps === 'string') {
					// The previous has a timestamps preference from the previous
					// regime. We can't set properties of a string, so set it to
					// an empty object.
					timestamps = {};
				}
				switch (targets[0]) {
				case 'all':
					timestamps.lobby = targets[1];
					timestamps.pms = targets[1];
					break;
				case 'lobby':
					timestamps.lobby = targets[1];
					break;
				case 'pms':
					timestamps.pms = targets[1];
					break;
				}
				this.add("Timestamps preference set to: '" + targets[1] + "' for '" + targets[0] + "'.");
				Storage.prefs('timestamps', timestamps);
				return false;

			case 'hl':
			case 'highlight':
				if (this.checkBroadcast(cmd, text)) return false;
				var highlights = Dex.prefs('highlights') || {};
				if (target.includes(' ')) {
					var targets = target.split(' ');
					var subCmd = targets[0];
					targets = targets.slice(1).join(' ').match(/([^,]+?({\d*,\d*})?)+/g);
					// trim the targets to be safe
					for (var i = 0, len = targets.length; i < len; i++) {
						targets[i] = targets[i].replace(/\n/g, '').trim();
					}
					switch (subCmd) {
					case 'add': case 'roomadd':
						var key = subCmd === 'roomadd' ? (Config.server.id + '#' + this.id) : 'global';
						var highlightList = highlights[key] || [];
						for (var i = 0, len = targets.length; i < len; i++) {
							if (!targets[i]) continue;
							if (/[\\^$*+?()|{}[\]]/.test(targets[i])) {
								// Catch any errors thrown by newly added regular expressions so they don't break the entire highlight list
								try {
									new RegExp(targets[i]);
								} catch (e) {
									return this.add('|error|' + (e.message.substr(0, 28) === 'Invalid regular expression: ' ? e.message : 'Invalid regular expression: /' + targets[i] + '/: ' + e.message));
								}
							}
							if (highlightList.includes(targets[i])) {
								return this.add('|error|' + targets[i] + ' is already on your highlights list.');
							}
						}
						highlights[key] = highlightList.concat(targets);
						this.add("Now highlighting on " + (key === 'global' ? "(everywhere): " : "(in " + key + "): ") + highlights[key].join(', '));
						// We update the regex
						this.updateHighlightRegExp(highlights);
						break;
					case 'delete': case 'roomdelete':
						var key = subCmd === 'roomdelete' ? (Config.server.id + '#' + this.id) : 'global';
						var highlightList = highlights[key] || [];
						var newHls = [];
						for (var i = 0, len = highlightList.length; i < len; i++) {
							if (targets.indexOf(highlightList[i]) === -1) {
								newHls.push(highlightList[i]);
							}
						}
						highlights[key] = newHls;
						this.add("Now highlighting on " + (key === 'global' ? "(everywhere): " : "(in " + key + "): ") + highlights[key].join(', '));
						// We update the regex
						this.updateHighlightRegExp(highlights);
						break;
					default:
						if (this.checkBroadcast(cmd, text)) return false;
						// Wrong command
						this.add('|error|Invalid /highlight command.');
						this.parseCommand('/help highlight'); // show help
						return false;
					}
					Storage.prefs('highlights', highlights);
				} else {
					if (this.checkBroadcast(cmd, text)) return false;
					if (['clear', 'roomclear', 'clearall'].includes(target)) {
						var key = (target === 'roomclear' ? (Config.server.id + '#' + this.id) : (target === 'clearall' ? '' : 'global'));
						if (key) {
							highlights[key] = [];
							this.add("All highlights (" + (key === 'global' ? "everywhere" : "in " + key) + ") cleared.");
							this.updateHighlightRegExp(highlightList);
						} else {
							Storage.prefs('highlights', false);
							this.add("All highlights (in all rooms and globally) cleared.");
							this.updateHighlightRegExp({});
						}
					} else if (['show', 'list', 'roomshow', 'roomlist'].includes(target)) {
						// Shows a list of the current highlighting words
						var key = target.startsWith('room') ? (Config.server.id + '#' + this.id) : 'global';
						if (highlights[key] && highlights[key].length > 0) {
							this.add("Current highlight list " + (key === 'global' ? "(everywhere): " : "(in " + key + "): ") + highlights[key].join(", "));
						} else {
							this.add('Your highlight list' + (key === 'global' ? '' : ' in ' + key) + ' is empty.');
						}
					} else {
						// Wrong command
						this.add('|error|Invalid /highlight command.');
						this.parseCommand('/help highlight'); // show help
						return false;
					}
				}
				return false;

			case 'rank':
			case 'ranking':
			case 'rating':
			case 'ladder':
				if (this.checkBroadcast(cmd, text)) return false;
				if (app.localLadder) return text;
				if (!target) {
					target = app.user.get('userid');
				}
				if (this.battle && !target.includes(',')) {
					target += ", " + this.id.split('-')[1];
				}

				var targets = target.split(',');
				var formatTargeting = false;
				var formats = {};
				var gens = {};
				for (var i = 1, len = targets.length; i < len; i++) {
					targets[i] = $.trim(targets[i]);
					if (targets[i].length === 4 && targets[i].substr(0, 3) === 'gen') {
						gens[targets[i]] = 1;
					} else {
						formats[toID(targets[i])] = 1;
					}
					formatTargeting = true;
				}

				var self = this;
				$.get(app.user.getActionPHP(), {
					act: 'ladderget',
					user: targets[0]
				}, Storage.safeJSON(function (data) {
					if (!data || !$.isArray(data)) return self.add('|raw|Error: corrupted ranking data');
					var buffer = '<div class="ladder"><table><tr><td colspan="8">User: <strong>' + toName(targets[0]) + '</strong></td></tr>';
					if (!data.length) {
						buffer += '<tr><td colspan="8"><em>This user has not played any ladder games yet.</em></td></tr>';
						buffer += '</table></div>';
						return self.add('|raw|' + buffer);
					}
					buffer += '<tr><th>Format</th><th><abbr title="Elo rating">Elo</abbr></th><th><abbr title="user\'s percentage chance of winning a random battle (aka GLIXARE)">GXE</abbr></th><th><abbr title="Glicko-1 rating: rating±deviation">Glicko-1</abbr></th><th>W</th><th>L</th><th>Total</th></tr>';

					var hiddenFormats = [];
					for (var i = 0; i < data.length; i++) {
						var row = data[i];
						if (!row) return self.add('|raw|Error: corrupted ranking data');
						var formatId = toID(row.formatid);
						if (!formatTargeting || formats[formatId] || gens[formatId.slice(0, 4)] || (gens['gen6'] && formatId.substr(0, 3) !== 'gen')) {
							buffer += '<tr>';
						} else {
							buffer += '<tr class="hidden">';
							hiddenFormats.push(BattleLog.escapeFormat(formatId));
						}

						// Validate all the numerical data
						var values = [row.elo, row.rpr, row.rprd, row.gxe, row.w, row.l, row.t];
						for (var j = 0; j < values.length; j++) {
							if (typeof values[j] !== 'number' && typeof values[j] !== 'string' || isNaN(values[j])) return self.add('|raw|Error: corrupted ranking data');
						}

						buffer += '<td>' + BattleLog.escapeFormat(formatId) + '</td><td><strong>' + Math.round(row.elo) + '</strong></td>';
						if (row.rprd > 100) {
							// High rating deviation. Provisional rating.
							buffer += '<td>&ndash;</td>';
							buffer += '<td><span><em>' + Math.round(row.rpr) + '<small> &#177; ' + Math.round(row.rprd) + '</small></em> <small>(provisional)</small></span></td>';
						} else {
							var gxe = Math.round(row.gxe * 10);
							buffer += '<td>' + Math.floor(gxe / 10) + '<small>.' + (gxe % 10) + '%</small></td>';
							buffer += '<td><em>' + Math.round(row.rpr) + '<small> &#177; ' + Math.round(row.rprd) + '</small></em></td>';
						}
						var N = parseInt(row.w, 10) + parseInt(row.l, 10) + parseInt(row.t, 10);
						buffer += '<td>' + row.w + '</td><td>' + row.l + '</td><td>' + N + '</td></tr>';
					}
					if (hiddenFormats.length) {
						if (hiddenFormats.length === data.length) {
							buffer += '<tr class="no-matches"><td colspan="8"><em>This user has not played any ladder games that match "' + BattleLog.escapeHTML(Object.keys(gens).concat(Object.keys(formats)).join(', ')) + '".</em></td></tr>';
						}
						buffer += '<tr><td colspan="8"><button name="showOtherFormats">' + hiddenFormats.slice(0, 3).join(', ') + (hiddenFormats.length > 3 ? ' and ' + (hiddenFormats.length - 3) + ' other formats' : '') + ' not shown</button></td></tr>';
					}
					var userid = toID(targets[0]);
					var registered = app.user.get('registered');
					if (registered && registered.userid === userid) {
						buffer += '<tr><td colspan="8" style="text-align:right"><a href="//' + Config.routes.users + '/' + userid + '">Reset W/L</a></tr></td>';
					}
					buffer += '</table></div>';
					self.add('|raw|' + buffer);
				}), 'text');
				return false;

			case 'buttonban':
				if (this.checkBroadcast(cmd, text)) return false;
				var self = this;
				app.addPopupPrompt("Why do you wish to ban this user?", "Ban user", function (reason) {
					self.send('/ban ' + toName(target) + ', ' + (reason || ''));
				});
				return false;

			case 'buttonmute':
				if (this.checkBroadcast(cmd, text)) return false;
				var self = this;
				app.addPopupPrompt("Why do you wish to mute this user?", "Mute user", function (reason) {
					self.send('/mute ' + toName(target) + ', ' + (reason || ''));
				});
				return false;

			case 'buttonunmute':
				if (this.checkBroadcast(cmd, text)) return false;
				this.send('/unmute ' + target);
				return false;

			case 'buttonkick':
			case 'buttonwarn':
				if (this.checkBroadcast(cmd, text)) return false;
				var self = this;
				app.addPopupPrompt("Why do you wish to warn this user?", "Warn user", function (reason) {
					self.send('/warn ' + toName(target) + ', ' + (reason || ''));
				});
				return false;

			case 'joim':
			case 'join':
			case 'j':
				if (this.checkBroadcast(cmd, text)) return false;
				if (noSpace) return text;
				if (app.rooms[target]) {
					app.focusRoom(target);
					return false;
				}
				var roomid = toID(target);
				if (app.rooms[roomid]) {
					app.focusRoom(roomid);
					return false;
				}
				return text; // Send the /join command through to the server.

			case 'part':
			case 'leave':
				if (this.checkBroadcast(cmd, text)) return false;
				if (this.requestLeave && !this.requestLeave()) return false;
				return text;

			case 'avatar':
				if (this.checkBroadcast(cmd, text)) return false;
				var parts = target.split(',');
				var avatar = parts[0].toLowerCase().replace(/[^a-z0-9-]+/g, '');
				// Replace avatar number with name before sending it to the server, only the client knows what to do with the numbers
				if (window.BattleAvatarNumbers && Object.prototype.hasOwnProperty.call(window.BattleAvatarNumbers, avatar)) {
					avatar = window.BattleAvatarNumbers[avatar];
				}
				Storage.prefs('avatar', avatar);
				return '/avatar ' + avatar; // Send the command through to the server.

			case 'afd':
				if (this.checkBroadcast(cmd, text)) return false;
				var cleanedTarget = toID(target);
				if (cleanedTarget === 'off' || cleanedTarget === 'disable') {
					Config.server.afd = false;
					if (typeof BattleTextNotAFD !== 'undefined') BattleText = BattleTextNotAFD;
					this.add('April Fools\' day mode disabled.');
				} else {
					Config.server.afd = true;
					if (typeof BattleTextAFD !== 'undefined') BattleText = BattleTextAFD;
					this.add('April Fools\' day mode enabled.');
				}
				for (var roomid in app.rooms) {
					var battle = app.rooms[roomid] && app.rooms[roomid].battle;
					if (!battle) continue;
					battle.resetToCurrentTurn();
				}
				return false;

			// documentation of client commands
			case 'help':
			case 'h':
				switch (toID(target)) {
				case 'chal':
				case 'chall':
				case 'challenge':
					this.add('/challenge - Open a prompt to challenge a user to a battle.');
					this.add('/challenge [user] - Challenge the user [user] to a battle.');
					this.add('/challenge [user], [format] - Challenge the user [user] to a battle in the specified [format].');
					this.add('/challenge [user], [format] @@@ [rules] - Challenge the user [user] to a battle with custom rules.');
					this.add('[rules] can be a comma-separated list of: [added rule], ![removed rule], -[banned thing], *[restricted thing], +[unbanned/unrestricted thing]');
					this.add('/battlerules - Detailed information on what can go in [rules].');
					return false;
				case 'accept':
					this.add('/accept - Accept a challenge if only one is pending.');
					this.add('/accept [user] - Accept a challenge from the specified user.');
					return false;
				case 'reject':
					this.add('/reject - Reject a challenge if only one is pending.');
					this.add('/reject [user] - Reject a challenge from the specified user.');
					return false;
				case 'user':
				case 'open':
					this.add('/user [user] - Open a popup containing the user [user]\'s avatar, name, rank, and chatroom list.');
					return false;
				case 'news':
					this.add('/news - Opens a popup containing the news.');
					return false;
				case 'ignore':
				case 'unignore':
					this.add('/ignore [user] - Ignore all messages from the user [user].');
					this.add('/unignore [user] - Remove the user [user] from your ignore list.');
					this.add('/ignorelist - List all the users that you currently ignore.');
					this.add('/clearignore - Remove all users on your ignore list.');
					this.add('Note that staff messages cannot be ignored.');
					return false;
				case 'nick':
					this.add('/nick [new username] - Change your username.');
					return false;
				case 'clear':
					this.add('/clear - Clear the room\'s chat log.');
					return false;
				case 'showdebug':
				case 'hidedebug':
					this.add('/showdebug - Receive debug messages from battle events.');
					this.add('/hidedebug - Ignore debug messages from battle events.');
					return false;
				case 'showjoins':
				case 'hidejoins':
					this.add('/showjoins [room] - Receive users\' join/leave messages. Optionally for only specified room.');
					this.add('/hidejoins [room] - Ignore users\' join/leave messages. Optionally for only specified room.');
					return false;
				case 'showbattles':
				case 'hidebattles':
					this.add('/showbattles - Receive links to new battles in Lobby.');
					this.add('/hidebattles - Ignore links to new battles in Lobby.');
					return false;
				case 'unpackhidden':
				case 'packhidden':
					this.add('/unpackhidden - Suppress hiding locked or banned users\' chat messages after the fact.');
					this.add('/packhidden - Hide locked or banned users\' chat messages after the fact.');
					this.add('Hidden messages from a user can be restored by clicking the button underneath their lock/ban reason.');
					return false;
				case 'timestamps':
					this.add('Set your timestamps preference:');
					this.add('/timestamps [all|lobby|pms], [minutes|seconds|off]');
					this.add('all - Change all timestamps preferences, lobby - Change only lobby chat preferences, pms - Change only PM preferences.');
					this.add('off - Set timestamps off, minutes - Show timestamps of the form [hh:mm], seconds - Show timestamps of the form [hh:mm:ss].');
					return false;
				case 'highlight':
				case 'hl':
					this.add('Set up highlights:');
					this.add('/highlight add [word 1], [word 2], [...] - Add the provided list of words to your highlight list.');
					this.add('/highlight roomadd [word 1], [word 2], [...] - Add the provided list of words to the highlight list of whichever room you used the command in.');
					this.add('/highlight list - List all words that currently highlight you.');
					this.add('/highlight roomlist - List all words that currently highlight you in whichever room you used the command in.');
					this.add('/highlight delete [word 1], [word 2], [...] - Delete the provided list of words from your entire highlight list.');
					this.add('/highlight roomdelete [word 1], [word 2], [...] - Delete the provided list of words from the highlight list of whichever room you used the command in.');
					this.add('/highlight clear - Clear your global highlight list.');
					this.add('/highlight roomclear - Clear the highlight list of whichever room you used the command in.');
					this.add('/highlight clearall - Clear your entire highlight list (all rooms and globally).');
					return false;
				case 'rank':
				case 'ranking':
				case 'rating':
				case 'ladder':
					this.add('/rating - Get your own rating.');
					this.add('/rating [username] - Get user [username]\'s rating.');
					return false;
				case 'afd':
					this.add('/afd - Enable April Fools\' Day sprites.');
					this.add('/afd disable - Disable April Fools\' Day sprites.');
					return false;
				}
			}

			return text;
		},

		challengeData: {},
		challengeUserdetails: function (data) {
			app.off('response:userdetails', this.challengeUserdetails);

			if (!data) return;

			if (data.rooms === false) {
				this.add('This player does not exist or is not online.');
				return;
			}

			app.focusRoom('');
			// if foe has changed name, challengeData.userid will be wrong, so defer to data
			var name = data.name || data.userid;
			if (/^[a-z0-9]/i.test(name)) name = ' ' + name;
			app.rooms[''].challenge(name, this.challengeData.format, this.challengeData.team);
		},

		showOtherFormats: function (d, target) {
			var autoscroll = (this.$chatFrame.scrollTop() + 60 >= this.$chat.height() - this.$chatFrame.height());

			var $target = $(target);
			var $table = $target.closest('table');
			$table.find('tr.hidden').show();
			$table.find('tr.no-matches').remove();
			$target.closest('tr').remove();

			if (autoscroll) {
				this.$chatFrame.scrollTop(this.$chat.height());
			}
		},
		destroy: function (alreadyLeft) {
			app.user.off('change', this.updateUser, this);
			Room.prototype.destroy.call(this, alreadyLeft);
		}
	}, {
		toggleFormatChar: function (textbox, formatChar) {
			if (!textbox.setSelectionRange) return false;

			var value = textbox.value;
			var start = textbox.selectionStart;
			var end = textbox.selectionEnd;

			// make sure start and end aren't midway through the syntax
			if (value.charAt(start) === formatChar && value.charAt(start - 1) === formatChar &&
				value.charAt(start - 2) !== formatChar) {
				start++;
			}
			if (value.charAt(end) === formatChar && value.charAt(end - 1) === formatChar &&
				value.charAt(end - 2) !== formatChar) {
				end--;
			}

			// wrap in doubled format char
			var wrap = formatChar + formatChar;
			value = value.substr(0, start) + wrap + value.substr(start, end - start) + wrap + value.substr(end);
			start += 2;
			end += 2;

			// prevent nesting
			var nesting = wrap + wrap;
			if (value.substr(start - 4, 4) === nesting) {
				value = value.substr(0, start - 4) + value.substr(start);
				start -= 4;
				end -= 4;
			} else if (start !== end && value.substr(start - 2, 4) === nesting) {
				value = value.substr(0, start - 2) + value.substr(start + 2);
				start -= 2;
				end -= 4;
			}
			if (value.substr(end, 4) === nesting) {
				value = value.substr(0, end) + value.substr(end + 4);
			} else if (start !== end && value.substr(end - 2, 4) === nesting) {
				value = value.substr(0, end - 2) + value.substr(end + 2);
				end -= 2;
			}

			textbox.value = value;
			textbox.setSelectionRange(start, end);
			return true;
		}
	});

	var ChatRoom = this.ChatRoom = ConsoleRoom.extend({
		minWidth: 320,
		minMainWidth: 580,
		maxWidth: 1024,
		isSideRoom: true,
		initialize: function () {
			var buf = '<div class="tournament-wrapper"></div><div class="chat-log"><div class="inner message-log" role="log"></div></div></div><div class="chat-log-add">Connecting...</div><ul class="userlist"></ul>';
			this.$el.addClass('ps-room-light').html(buf);

			this.$chatAdd = this.$('.chat-log-add');
			this.$chatFrame = this.$('.chat-log');
			this.$chat = this.$('.inner');
			this.$chatbox = null;

			this.$tournamentWrapper = this.$('.tournament-wrapper');
			this.tournamentBox = null;

			this.users = {};
			this.userCount = {};

			this.$joinLeave = null;
			this.joinLeave = {
				'join': [],
				'leave': []
			};

			this.$userList = this.$('.userlist');
			this.userList = new UserList({
				el: this.$userList,
				room: this
			});
		},
		updateLayout: function () {
			if (this.$el.width() >= 570) {
				this.userList.show();
				this.$chatFrame.addClass('hasuserlist');
				this.$chatAdd.addClass('hasuserlist');
				this.$tournamentWrapper.addClass('hasuserlist');
			} else {
				this.userList.hide();
				this.$chatFrame.removeClass('hasuserlist');
				this.$chatAdd.removeClass('hasuserlist');
				this.$tournamentWrapper.removeClass('hasuserlist');
			}
			this.$chatFrame.scrollTop(this.$chat.height());
			if (this.tournamentBox) this.tournamentBox.updateLayout();
		},
		show: function () {
			Room.prototype.show.apply(this, arguments);
			this.updateLayout();
		},
		join: function () {
			app.send('/join ' + this.id);
		},
		leave: function () {
			app.send('/noreply /leave ' + this.id);
			app.updateAutojoin();
		},
		requestLeave: function (e) {
			if (app.rooms[''].games && app.rooms[''].games[this.id]) {
				app.addPopup(ForfeitPopup, {room: this, sourceEl: e && e.currentTarget, gameType: (this.id.substring(0, 5) === 'help-' ? 'help' : 'game')});
				return false;
			} else if (Dex.prefs('leavePopupRoom')) {
				app.addPopup(ForfeitPopup, {room: this, sourceEl: e && e.currentTarget, gameType: 'room'});
				return false;
			}
			return true;
		},
		receive: function (data) {
			this.add(data);
		},
		getUserGroup: function (userid) {
			return (app.rooms[this.id].users[userid] || {group: ' '}).group;
		},
		add: function (log) {
			if (typeof log === 'string') log = log.split('\n');
			var autoscroll = false;
			if (this.$chatFrame.scrollTop() + 60 >= this.$chat.height() - this.$chatFrame.height()) {
				autoscroll = true;
			}
			var userlist = '';
			for (var i = 0; i < log.length; i++) {
				if (log[i].substr(0, 7) === '|users|') {
					userlist = log[i];
				} else {
					this.addRow(log[i]);
				}
			}
			if (userlist) this.addRow(userlist);
			if (autoscroll) {
				this.$chatFrame.scrollTop(this.$chat.height());
			}
			var $children = this.$chat.children();
			if ($children.length > 900) {
				$children.slice(0, 100).remove();
			}
		},
		addPM: function (user, message, pm) {
			var autoscroll = false;
			if (this.$chatFrame.scrollTop() + 60 >= this.$chat.height() - this.$chatFrame.height()) {
				autoscroll = true;
			}
			if (!(message.substr(0, 4) === '/raw' || message.substr(0, 5) === '/html' || message.substr(0, 6) === '/uhtml' || message.substr(0, 12) === '/uhtmlchange')) this.addChat(user, message, pm);
			if (autoscroll) {
				this.$chatFrame.scrollTop(this.$chat.height());
			}
			if (!app.focused) app.playNotificationSound();
		},
		addRow: function (line) {
			var name, name2, silent;
			if (line && typeof line === 'string') {
				if (line.charAt(0) !== '|') line = '||' + line;
				var row = line.substr(1).split('|');
				switch (row[0]) {
				case 'init':
					// ignore (handled elsewhere)
					break;

				case 'title':
					this.title = row[1];
					app.roomTitleChanged(this);
					app.topbar.updateTabbar();
					break;

				case 'c':
				case 'chat':
					if (/[a-zA-Z0-9]/.test(row[1].charAt(0))) row[1] = ' ' + row[1];
					this.addChat(row[1], row.slice(2).join('|'));
					break;

				case ':':
					this.timeOffset = ~~(Date.now() / 1000) - (parseInt(row[1], 10) || 0);
					break;
				case 'c:':
					if (/[a-zA-Z0-9]/.test(row[2].charAt(0))) row[2] = ' ' + row[2];
					var msgTime = this.timeOffset + (parseInt(row[1], 10) || 0);
					this.addChat(row[2], row.slice(3).join('|'), false, msgTime);
					break;

				case 'tc':
					if (/[a-zA-Z0-9]/.test(row[2].charAt(0))) row[2] = ' ' + row[2];
					var msgTime = row[1] ? ~~(Date.now() / 1000) - (parseInt(row[1], 10) || 0) : 0;
					this.addChat(row[2], row.slice(3).join('|'), false, msgTime);
					break;

				case 'b':
				case 'B':
					var id = row[1];
					name = row[2];
					name2 = row[3];
					silent = (row[0] === 'B');

					var matches = ChatRoom.parseBattleID(id);
					if (!matches) {
						return; // bogus room ID could be used to inject JavaScript
					}
					var format = BattleLog.escapeFormat(matches[1]);

					if (silent && !Dex.prefs('showbattles')) return;

					this.addJoinLeave();
					var battletype = 'Battle';
					if (format) {
						battletype = format + ' battle';
						if (format === 'Random Battle') battletype = 'Random Battle';
					}
					this.$chat.append('<div class="notice"><a href="' + app.root + id + '" class="ilink">' + battletype + ' started between <strong style="' + BattleLog.hashColor(toUserid(name)) + '">' + BattleLog.escapeHTML(name) + '</strong> and <strong style="' + BattleLog.hashColor(toUserid(name2)) + '">' + BattleLog.escapeHTML(name2) + '</strong>.</a></div>');
					break;

				case 'j':
				case 'join':
				case 'J':
					this.addJoinLeave('join', row[1], null, row[0] === 'J');
					break;

				case 'l':
				case 'leave':
				case 'L':
					this.addJoinLeave('leave', row[1], null, row[0] === 'L');
					break;

				case 'n':
				case 'name':
				case 'N':
					this.addJoinLeave('rename', row[1], row[2], true);
					break;


				case 'users':
					this.parseUserList(row[1]);
					break;

				case 'usercount':
					if (this.id === 'lobby') {
						this.userCount.globalUsers = parseInt(row[1], 10);
						this.userList.updateUserCount();
					}
					break;

				case 'formats':
					// deprecated; please send formats to the global room
					app.parseFormats(row);
					break;

				case 'raw':
				case 'html':
					this.$chat.append('<div class="notice">' + BattleLog.sanitizeHTML(row.slice(1).join('|')) + '</div>');
					break;

				case 'notify':
					if (row[3] && !this.getHighlight(row[3])) return;
					app.playNotificationSound();
					this.notifyOnce(row[1], row[2], 'highlight');
					break;

				case 'tempnotify':
					var notifyOnce = row[4] !== '!';
					if (!notifyOnce) row[4] = '';
					if (row[4] && !this.getHighlight(row[4])) return;
					if (!this.notifications) app.playNotificationSound();
					this.notify(row[2], row[3], row[1], notifyOnce);
					break;

				case 'tempnotifyoff':
					this.closeNotification(row[1]);
					break;

				case 'error':
					this.$chat.append('<div class="notice message-error">' + BattleLog.parseMessage(row.slice(1).join('|'), true) + '</div>');
					break;

				case 'uhtml':
				case 'uhtmlchange':
					var $elements = this.$chat.find('div.uhtml-' + toID(row[1]));
					var html = row.slice(2).join('|');
					if (!html) {
						$elements.remove();
					} else if (!$elements.length) {
						if (row[0] === 'uhtmlchange') {
							this.$chat.prepend('<div class="notice uhtml-' + toID(row[1]) + '">' + BattleLog.sanitizeHTML(html) + '</div>');
						} else {
							this.$chat.append('<div class="notice uhtml-' + toID(row[1]) + '">' + BattleLog.sanitizeHTML(html) + '</div>');
						}
					} else if (row[0] === 'uhtmlchange') {
						$elements.html(BattleLog.sanitizeHTML(html));
					} else {
						$elements.remove();
						this.$chat.append('<div class="notice uhtml-' + toID(row[1]) + '">' + BattleLog.sanitizeHTML(html) + '</div>');
					}
					break;

				case 'unlink':
					// |unlink| is deprecated in favor of |hidelines|
					// note: this message has global effects, but it's handled here
					// so that it can be included in the scrollback buffer.
					if (Dex.prefs('nounlink')) return;
					var user = toID(row[2]) || toID(row[1]);
					var $messages = $('.chatmessage-' + user);
					if (!$messages.length) break;
					$messages.find('a').contents().unwrap();
					if (row[2]) {
						// there used to be a condition for
						// row[1] === 'roomhide'
						// but it's now always applied
						$messages = this.$chat.find('.chatmessage-' + user);
						if (!$messages.length) break;
						var lineCount = parseInt(row[3], 10) || 0;
						if (lineCount) $messages = $messages.slice(-lineCount);
						$messages.hide().addClass('revealed').find('button').parent().remove();
						this.$chat.children().last().append(' <button name="toggleMessages" value="' + user + '" class="subtle"><small>(' + $messages.length + ' line' + ($messages.length > 1 ? 's' : '') + ' from ' + user + ' hidden)</small></button>');
					}
					break;
				case 'hidelines':
					if (Dex.prefs('nounlink')) return;
					var user = toID(row[2]);
					var $messages = $('.chatmessage-' + user);
					if (!$messages.length) break;
					$messages.find('a').contents().unwrap();
					if (row[1] !== 'unlink') {
						$messages = this.$chat.find('.chatmessage-' + user);
						if (!$messages.length) break;
						var lineCount = parseInt(row[3], 10) || 0;
						if (lineCount) $messages = $messages.slice(-lineCount);
						$messages.hide().addClass('revealed').find('button').parent().remove();
						var staffGroups = Object.keys(Config.groups).filter(function (group) {
							return ['staff', 'leadership'].includes(Config.groups[group].type);
						});
						if (row[1] === 'hide' || staffGroups.includes(this.getUserGroup(app.user.get('userid')))) {
							this.$chat.children().last().append(' <button name="toggleMessages" value="' + user + '" class="subtle"><small>(' + $messages.length + ' line' + ($messages.length > 1 ? 's' : '') + ' from ' + user + ' hidden)</small></button>');
						}
					}
					break;
				case 'tournament':
				case 'tournaments':
					if (Dex.prefs('tournaments') === 'hide') {
						if (row[1] === 'create') {
							this.$chat.append('<div class="notice">' + BattleLog.escapeFormat(row[2]) + ' ' + BattleLog.escapeHTML(row[3]) + ' tournament created (and hidden because you have tournaments disabled).</div>');
						} else if (row[1] === 'start') {
							this.$chat.append('<div class="notice">Tournament started.</div>');
						} else if (row[1] === 'forceend') {
							this.$chat.append('<div class="notice">Tournament force-ended.</div>');
						} else if (row[1] === 'end') {
							this.$chat.append('<div class="notice">Tournament ended.</div>');
						}
						break;
					}
					if (!this.tournamentBox) this.tournamentBox = new TournamentBox(this, this.$tournamentWrapper);
					if (!this.tournamentBox.parseMessage(row.slice(1), row[0] === 'tournaments')) break;
					// fallthrough in case of unparsed message

				case '':
					this.$chat.append('<div class="notice">' + BattleLog.escapeHTML(row.slice(1).join('|')) + '</div>');
					break;

				default:
					this.$chat.append('<div class="notice"><code>|' + BattleLog.escapeHTML(row.join('|')) + '</code></div>');
					break;
				}
			}
		},
		toggleMessages: function (user, button) {
			var $messages = this.$('.chatmessage-' + user + '.revealed');
			var $button = $(button);
			if (!$messages.is(':hidden')) {
				$messages.hide();
				$button.html('<small>(' + ($messages.length) + ' line' + ($messages.length !== 1 ? 's' : '') + ' from ' + user + ' hidden)</small>');
			} else {
				$button.html('<small>(Hide ' + ($messages.length) + ' line' + ($messages.length !== 1 ? 's' : '') + ' from ' + user + ')</small>');
				$messages.show();
			}
		},
		tournamentButton: function (val, button) {
			if (this.tournamentBox) this.tournamentBox[$(button).data('type')](val, button);
		},
		parseUserList: function (userList) {
			this.userCount = {};
			this.users = {};
			var commaIndex = userList.indexOf(',');
			if (commaIndex >= 0) {
				this.userCount.users = parseInt(userList.substr(0, commaIndex), 10);
				var users = userList.substr(commaIndex + 1).split(',');
				for (var i = 0, len = users.length; i < len; i++) {
					if (users[i]) {
						var user = BattleTextParser.parseNameParts(users[i]);
						this.users[toUserid(user.name)] = user;
					}
				}
			} else {
				this.userCount.users = parseInt(userList, 10);
				this.userCount.guests = this.userCount.users;
			}
			this.userList.construct();
		},
		addJoinLeave: function (action, name, oldid, silent) {
			if (!action) {
				this.$joinLeave = null;
				this.joinLeave = {
					'join': [],
					'leave': []
				};
				return;
			}
			var user = BattleTextParser.parseNameParts(name);
			var userid = toUserid(user.name);
			if (action === 'join') {
				if (oldid) delete this.users[toUserid(oldid)];
				if (!this.users[userid]) this.userCount.users++;
				this.users[userid] = user;
				this.userList.add(userid);
				this.userList.updateUserCount();
				this.userList.updateNoUsersOnline();
			} else if (action === 'leave') {
				if (this.users[userid]) this.userCount.users--;
				delete this.users[userid];
				this.userList.remove(userid);
				this.userList.updateUserCount();
				this.userList.updateNoUsersOnline();
			} else if (action === 'rename') {
				if (oldid) delete this.users[toUserid(oldid)];
				this.users[userid] = user;
				this.userList.remove(oldid);
				this.userList.add(userid);
				return;
			}
			var allShowjoins = Dex.prefs('showjoins') || {};
			var showjoins = allShowjoins[Config.server.id];
			if (silent && (!showjoins || (!showjoins['global'] && !showjoins[this.id]) || showjoins[this.id] === 0)) {
				return;
			}
			if (!this.$joinLeave) {
				this.$chat.append('<div class="message"><small>Loading...</small></div>');
				this.$joinLeave = this.$chat.children().last();
			}

			var formattedUser = user.group + user.name;
			if (action === 'join' && this.joinLeave['leave'].includes(formattedUser)) {
				this.joinLeave['leave'].splice(this.joinLeave['leave'].indexOf(formattedUser), 1);
			} else {
				this.joinLeave[action].push(formattedUser);
			}

			var message = '';
			if (this.joinLeave['join'].length) {
				message += this.displayJoinLeaves(this.joinLeave['join'], 'joined');
			}
			if (this.joinLeave['leave'].length) {
				if (this.joinLeave['join'].length) message += '; ';
				message += this.displayJoinLeaves(this.joinLeave['leave'], 'left') + '<br />';
			}
			this.$joinLeave.html('<small style="color: #555555">' + message + '</small>');
		},
		displayJoinLeaves: function (preList, action) {
			var message = '';
			var list = [];
			var named = {};
			for (var j = 0; j < preList.length; j++) {
				if (!named[preList[j]]) list.push(preList[j]);
				named[preList[j]] = true;
			}
			for (var j = 0; j < list.length; j++) {
				if (j >= 5) {
					message += ', and ' + (list.length - 5) + ' others';
					break;
				}
				if (j > 0) {
					if (j == 1 && list.length == 2) {
						message += ' and ';
					} else if (j == list.length - 1) {
						message += ', and ';
					} else {
						message += ', ';
					}
				}
				message += BattleLog.escapeHTML(list[j]);
			}
			return message + ' ' + action;
		},
		addChat: function (name, message, pm, msgTime) {
			var userid = toUserid(name);

			var speakerHasAuth = !" +\u2606".includes(name.charAt(0));
			var user = (this.users && this.users[app.user.get('userid')]) || {};
			var readerHasAuth = !" +\u2606\u203D\u2716!".includes(user.group || ' ');
			if (app.ignore[userid] && !speakerHasAuth && !readerHasAuth) {
				if (!app.ignoreNotified) {
					this.$chat.append(
						'<div class="chat">A message from ' + BattleLog.escapeHTML(name) + ' was ignored. (to unignore use /unignore)</div>'
					);
					app.ignoreNotified = true;
				}
				return;
			}

			// Add this user to the list of people who have spoken recently.
			this.markUserActive(userid);

			this.$joinLeave = null;
			this.joinLeave = {
				'join': [],
				'leave': []
			};

			if (pm) {
				var pmuserid = toUserid(pm);
				var oName = pmuserid === app.user.get('userid') ? name : pm;
				var clickableName = '<span class="username" data-name="' + BattleLog.escapeHTML(name) + '">' + BattleLog.escapeHTML(name.substr(1)) + '</span>';
				this.$chat.append(
					'<div class="chat chatmessage-' + toID(name) + '">' + ChatRoom.getTimestamp('lobby', msgTime) +
					'<strong style="' + BattleLog.hashColor(userid) + '">' + clickableName + ':</strong>' +
					'<span class="message-pm"><i class="pmnote" data-name="' + BattleLog.escapeHTML(oName) + '">(Private to ' + BattleLog.escapeHTML(pm) + ')</i> ' + BattleLog.parseMessage(message) + '</span>' +
					'</div>'
				);
				return; // PMs independently notify in the main menu; no need to make them notify again with `inchatpm`.
			}

			var lastMessageDates = Dex.prefs('logtimes') || (Storage.prefs('logtimes', {}), Dex.prefs('logtimes'));
			if (!lastMessageDates[Config.server.id]) lastMessageDates[Config.server.id] = {};
			var lastMessageDate = lastMessageDates[Config.server.id][this.id] || 0;
			// because the time offset to the server can vary slightly, subtract it to not have it affect comparisons between dates
			var serverMsgTime = msgTime - (this.timeOffset || 0);
			var mayNotify = serverMsgTime > lastMessageDate && userid !== app.user.get('userid');

			if (app.focused && (this === app.curSideRoom || this === app.curRoom)) {
				this.lastMessageDate = 0;
				lastMessageDates[Config.server.id][this.id] = serverMsgTime;
				Storage.prefs.save();
			} else {
				// To be saved on focus
				this.lastMessageDate = Math.max(this.lastMessageDate || 0, serverMsgTime);
			}

			var isHighlighted = userid !== app.user.get('userid') && this.getHighlight(message);
			var parsedMessage = MainMenuRoom.parseChatMessage(message, name, ChatRoom.getTimestamp('chat', msgTime), isHighlighted, this.$chat, true);
			if (typeof parsedMessage.challenge === 'string') {
				this.$chat.append('<div class="chat message-error">The server sent a challenge but this isn\'t a PM window!</div>');
				return;
			}
			if (typeof parsedMessage === 'object' && 'noNotify' in parsedMessage) {
				mayNotify = mayNotify && !parsedMessage.noNotify;
				parsedMessage = parsedMessage.message;
			}
			if (!$.isArray(parsedMessage)) parsedMessage = [parsedMessage];
			for (var i = 0; i < parsedMessage.length; i++) {
				if (!parsedMessage[i]) continue;
				this.$chat.append(parsedMessage[i]);
			}

			if (mayNotify && isHighlighted) {
				app.playNotificationSound();
				var $lastMessage = this.$chat.children().last();
				var notifyTitle = "Mentioned by " + name + (this.id === 'lobby' ? '' : " in " + this.title);
				var notifyText = $lastMessage.html().indexOf('<span class="spoiler">') >= 0 ? '(spoiler)' : $lastMessage.children().last().text();
				this.notifyOnce(notifyTitle, "\"" + notifyText + "\"", 'highlight');
			} else if (mayNotify && this.id.substr(0, 5) === 'help-') {
				this.notifyOnce("Help message from " + name, "\"" + message + "\"", 'pm');
			} else if (mayNotify && name !== '~') { // |c:|~| prefixes a system message
				this.subtleNotifyOnce();
			}

			if (message.slice(0, 4) === '/me ' || message.slice(0, 5) === '/mee') {
				Storage.logChat(this.id, '* ' + name + (message.slice(0, 4) === '/me ' ? ' ' : '') + message);
			} else if (message.slice(0, 5) === '/log ') {
				Storage.logChat(this.id, '' + message.slice(5));
			} else {
				Storage.logChat(this.id, '' + name + ': ' + message);
			}
		},
		destroy: function (alreadyLeft) {
			if (this.tournamentBox) {
				app.user.off('saveteams', this.tournamentBox.updateTeams, this.tournamentBox);
			}
			ConsoleRoom.prototype.destroy.call(this, alreadyLeft);
		}
	}, {
		getTimestamp: function (section, msgTime) {
			var pref = Dex.prefs('timestamps') || {};
			var sectionPref = ((section === 'pms') ? pref.pms : pref.lobby) || 'off';
			if ((sectionPref === 'off') || (sectionPref === undefined)) return '';

			var date = (msgTime && !isNaN(msgTime) ? new Date(msgTime * 1000) : new Date());
			var components = [date.getHours(), date.getMinutes()];
			if (sectionPref === 'seconds') {
				components.push(date.getSeconds());
			}
			return '<small>[' + components.map(
				function (x) { return (x < 10) ? '0' + x : x; }
			).join(':') + '] </small>';
		},
		parseBattleID: function (id) {
			if (id.lastIndexOf('-') > 6) {
				return id.match(/^battle\-([a-z0-9]*)\-?[0-9]*$/);
			}
			return id.match(/^battle\-([a-z0-9]*[a-z])[0-9]*$/);
		}
	});

	// user list

	var UserList = this.UserList = Backbone.View.extend({
		initialize: function (options) {
			this.room = options.room;
		},
		events: {
			'click .userlist-count': 'toggleUserlist'
		},
		construct: function () {
			var plural = this.room.userCount.users === 1 ? ' user' : ' users';
			var buf = '';
			var usersString = "" + (this.room.userCount.users || '0') + plural;
			buf += '<li class="userlist-count" id="' + this.room.id + '-userlist-users" style="text-align:center;padding:2px 0">';
			buf += '<small id="' + this.room.id + '-usercount-users">' + usersString + '</small></li>';

			var users = [];
			if (this.room.users) {
				var self = this;
				users = Object.keys(this.room.users).sort(function (a, b) {
					return self.comparator(a, b);
				});
			}
			for (var i = 0; i < users.length; i++) {
				var userid = users[i];
				buf += this.constructItem(userid);
			}
			if (!users.length) {
				buf += this.getNoNamedUsersOnline();
			}
			if (this.room.userCount.guests) {
				buf += '<li id="' + this.room.id + '-userlist-guests" style="text-align:center;padding:2px 0"><small>(<span id="' + this.room.id + '-usercount-guests">' + this.room.userCount.guests + '</span> guest' + (this.room.userCount.guests == 1 ? '' : 's') + ')</small></li>';
			}
			this.$el.html(buf);
		},
		toggleUserlist: function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (this.$el.hasClass('userlist-minimized')) {
				this.$el.removeClass('userlist-minimized');
				this.$el.addClass('userlist-maximized');
			} else if (this.$el.hasClass('userlist-maximized')) {
				this.$el.removeClass('userlist-maximized');
				this.$el.addClass('userlist-minimized');
			}
		},
		show: function () {
			this.$el.removeClass('userlist-minimized');
			this.$el.removeClass('userlist-maximized');
		},
		hide: function () {
			this.$el.scrollTop(0);
			this.$el.removeClass('userlist-maximized');
			this.$el.addClass('userlist-minimized');
		},
		updateUserCount: function () {
			var users = Math.max(this.room.userCount.users || 0, this.room.userCount.globalUsers || 0);
			$('#' + this.room.id + '-usercount-users').html('' + users + (users === 1 ? ' user' : ' users'));
		},
		add: function (userid) {
			$('#' + this.room.id + '-userlist-user-' + userid).remove();
			var users = this.$el.children();
			// Determine where to insert the user using a binary search.
			var left = 0;
			var right = users.length - 1;
			while (right >= left) {
				var mid = Math.floor((right - left) / 2 + left);
				var cmp = this.elemComparator(users[mid], userid);
				if (cmp < 0) {
					left = mid + 1;
				} else if (cmp > 0) {
					right = mid - 1;
				} else {
					// The user is already in the list.
					return;
				}
			}
			$(this.constructItem(userid)).insertAfter($(users[right]));
		},
		remove: function (userid) {
			$('#' + this.room.id + '-userlist-user-' + userid).remove();
		},
		constructItem: function (userid) {
			var user = this.room.users[userid];
			var text = '';
			// Sanitising the `userid` here is probably unnecessary, because
			// IDs can't contain anything dangerous.
			text += '<li' + (this.room.userForm === userid ? ' class="cur"' : '') + ' id="' + this.room.id + '-userlist-user-' + BattleLog.escapeHTML(userid) + '">';
			text += '<button class="userbutton username" data-roomgroup="' + BattleLog.escapeHTML(user.group) + '" data-name="' + BattleLog.escapeHTML(user.name) + '"';
			text += (user.away ? ' data-away=true' : '') + (user.status ? ' data-status="' + BattleLog.escapeHTML(user.status) + '"' : '') + '>';
			var group = user.group;
			var details = Config.groups[group] || {type: 'user'};
			var color = user.away ? 'color:#888;' : BattleLog.hashColor(userid);
			text += '<em class="group' + (details.group === 2 ? ' staffgroup' : '') + '">' + BattleLog.escapeHTML(group) + '</em>';
			if (details.type === 'leadership') {
				text += '<strong><em style="' + color + '">' + BattleLog.escapeHTML(user.name) + '</em></strong>';
			} else if (details.type === 'staff') {
				text += '<strong style="' + color + '">' + BattleLog.escapeHTML(user.name) + '</strong>';
			} else {
				text += '<span style="' + color + '">' + BattleLog.escapeHTML(user.name) + '</span>';
			}
			text += '</button>';
			text += '</li>';
			return text;
		},
		elemComparator: function (elem, userid) {
			// look at the part of the `id` after the roomid
			var id = elem.id.substr(this.room.id.length + 1);
			switch (id) {
			case 'userlist-users':
				return -1; // `elem` comes first
			case 'userlist-empty':
			case 'userlist-unregistered':
			case 'userlist-guests':
				return 1; // `userid` comes first
			}
			// extract the portion of the `id` after 'userlist-user-'
			var elemuserid = id.substr(14);
			return this.comparator(elemuserid, userid);
		},
		comparator: function (a, b) {
			if (a === b) return 0;

			var aUser = this.room.users[a] || {group: Config.defaultGroup, away: false};
			var bUser = this.room.users[b] || {group: Config.defaultGroup, away: false};

			var aRank = (
				Config.groups[aUser.group || ' '] ||
				{order: (Config.defaultOrder || 10006.5)}
			).order;
			var bRank = (
				Config.groups[bUser.group || ' '] ||
				{order: (Config.defaultOrder || 10006.5)}
			).order;

			if (aRank !== bRank) return aRank - bRank;
			if ((aUser.away ? 1 : 0) !== (bUser.away ? 1 : 0)) return (aUser.away ? 1 : 0) - (bUser.away ? 1 : 0);
			return (a > b ? 1 : -1);
		},
		getNoNamedUsersOnline: function () {
			return '<li id="' + this.room.id + '-userlist-empty">Only guests</li>';
		},
		updateNoUsersOnline: function () {
			var elem = $('#' + this.room.id + '-userlist-empty');
			if ($("[id^=" + this.room.id + "-userlist-user-]").length === 0) {
				if (elem.length === 0) {
					var guests = $('#' + this.room.id + '-userlist-guests');
					if (guests.length === 0) {
						this.$el.append($(this.getNoNamedUsersOnline()));
					} else {
						guests.before($(this.getNoNamedUsersOnline()));
					}
				}
			} else {
				elem.remove();
			}
		}
	});

}).call(this, jQuery);

function ChatHistory() {
	this.lines = [];
	this.index = 0;
}

ChatHistory.prototype.push = function (line) {
	var duplicate = this.lines.indexOf(line);
	if (duplicate >= 0) this.lines.splice(duplicate, 1);
	if (this.lines.length > 100) this.lines.splice(0, 20);
	this.lines.push(line);
	this.index = this.lines.length;
};

ChatHistory.prototype.up = function (line) { // Ensure index !== 0 first!
	if (line !== '') this.lines[this.index] = line;
	return this.lines[--this.index];
};

ChatHistory.prototype.down = function (line) {
	if (line !== '') this.lines[this.index] = line;
	if (this.index === this.lines.length) return '';
	if (++this.index === this.lines.length) return '';
	return this.lines[this.index];
};

(function ($) {

	var BattleRoom = this.BattleRoom = ConsoleRoom.extend({
		type: 'battle',
		title: '',
		minWidth: 320,
		minMainWidth: 956,
		maxWidth: 1180,
		initialize: function (data) {
			this.choice = undefined;
			/** are move/switch/team-preview controls currently being shown? */
			this.controlsShown = false;

			this.battlePaused = false;
			this.autoTimerActivated = false;

			this.isSideRoom = Dex.prefs('rightpanelbattles');

			this.$el.addClass('ps-room-opaque').html('<div class="battle">Battle is here</div><div class="foehint"></div><div class="battle-log" aria-label="Battle Log" role="complementary"></div><div class="battle-log-add">Connecting...</div><ul class="battle-userlist userlist userlist-minimized"></ul><div class="battle-controls" role="complementary" aria-label="Battle Controls"></div><br> <button class="battle-chat-toggle button" name="showChat"><i class="fa fa-caret-left"></i> Chat</button>');

			this.$battle = this.$el.find('.battle');
			this.$controls = this.$el.find('.battle-controls');
			this.$chatFrame = this.$el.find('.battle-log');
			this.$chatAdd = this.$el.find('.battle-log-add');
			this.$foeHint = this.$el.find('.foehint');

			BattleSound.setMute(Dex.prefs('mute'));
			this.battle = new Battle({
				id: this.id,
				$frame: this.$battle,
				$logFrame: this.$chatFrame
			});
			this.battle.roomid = this.id;
			this.battle.joinButtons = true;
			this.tooltips = this.battle.scene.tooltips;
			this.tooltips.listen(this.$controls);

			var self = this;
			this.battle.subscribe(function () { self.updateControls(); });

			this.users = {};
			this.userCount = {users: 0};
			this.$userList = this.$('.userlist');
			this.userList = new UserList({
				el: this.$userList,
				room: this
			});
			this.userList.construct();

			this.$chat = this.$chatFrame.find('.inner');

			this.$options = this.battle.scene.$options.html('<div style="padding-top: 3px; padding-right: 3px; text-align: right"><button class="icon button" name="openBattleOptions" title="Options">Battle Options</button></div>');
		},
		events: {
			'click .replayDownloadButton': 'clickReplayDownloadButton',
			'change input[name=zmove]': 'updateZMove',
			'change input[name=dynamax]': 'updateMaxMove'
		},
		battleEnded: false,
		join: function () {
			console.log("testtJ");
			app.send('/join ' + this.id);
		},
		showChat: function () {
			this.$('.battle-chat-toggle').attr('name', 'hideChat').html('Battle <i class="fa fa-caret-right"></i>');
			this.$el.addClass('showing-chat');
		},
		hideChat: function () {
			this.$('.battle-chat-toggle').attr('name', 'showChat').html('<i class="fa fa-caret-left"></i> Chat');
			this.$el.removeClass('showing-chat');
		},
		leave: function () {
			console.log("tesstt");
			if (!this.expired) //app.send('/noreply /leave ' + this.id);

			if (this.battle) this.battle.destroy();
		},
		requestLeave: function (e) {
			if (this.side && this.battle && !this.battleEnded && !this.expired && !this.battle.forfeitPending) {
				app.addPopup(ForfeitPopup, {room: this, sourceEl: e && e.currentTarget, gameType: 'battle'});
				return false;
			}
			return true;
		},
		updateLayout: function () {
			var width = this.$el.width();
			if (width < 950 || this.battle.hardcoreMode) {
				this.battle.messageShownTime = 500;
			} else {
				this.battle.messageShownTime = 1;
			}
			if (width && width < 640) {
				var scale = (width / 640);
				this.$battle.css('transform', 'scale(' + scale + ')');
				this.$foeHint.css('transform', 'scale(' + scale + ')');
				this.$controls.css('top', 360 * scale + 10);
			} else {
				this.$battle.css('transform', 'none');
				this.$foeHint.css('transform', 'none');
				this.$controls.css('top', 370);
			}
			this.$el.toggleClass('small-layout', width < 830);
			this.$el.toggleClass('tiny-layout', width < 640);
			if (this.$chat) this.$chatFrame.scrollTop(this.$chat.height());
		},
		show: function () {
			Room.prototype.show.apply(this, arguments);
			this.updateLayout();
		},
		receive: function (data) {
			this.add(data);
		},
		focus: function (e) {
			this.tooltips.hideTooltip();
			if (this.battle.paused && !this.battlePaused) {
				if (Dex.prefs('noanim')) this.battle.seekTurn(Infinity);
				this.battle.play();
			}
			ConsoleRoom.prototype.focus.call(this, e);
		},
		blur: function () {
			this.battle.pause();
		},
		init: function (data) {
			var log = data.split('\n');
			if (data.substr(0, 6) === '|init|') log.shift();
			if (log.length && log[0].substr(0, 7) === '|title|') {
				this.title = log[0].substr(7);
				log.shift();
				//app.roomTitleChanged(this);
			}
			if (this.battle.stepQueue.length) return;
			this.battle.stepQueue = log;
			this.battle.seekTurn(Infinity, true);
			if (this.battle.ended) this.battleEnded = true;
			this.updateLayout();
			this.updateControls();
		},
		add: function (data) {
			if (!data) return;
			console.log(data);
			if (data.substr(0, 6) === '|init|') {
				return this.init(data);
			}
			if (data.substr(0, 9) === '|request|') {
				data = data.slice(9);

				var requestData = null;
				var choiceText = null;

				var nlIndex = data.indexOf('\n');
				if (/[0-9]/.test(data.charAt(0)) && data.charAt(1) === '|') {
					// message format:
					//   |request|CHOICEINDEX|CHOICEDATA
					//   REQUEST

					// This is backwards compatibility with old code that violates the
					// expectation that server messages can be streamed line-by-line.
					// Please do NOT EVER push protocol changes without a pull request.
					// https://github.com/Zarel/Pokemon-Showdown/commit/e3c6cbe4b91740f3edc8c31a1158b506f5786d72#commitcomment-21278523
					choiceText = '?';
					data = data.slice(2, nlIndex);
				} else if (nlIndex >= 0) {
					// message format:
					//   |request|REQUEST
					//   |sentchoice|CHOICE
					if (data.slice(nlIndex + 1, nlIndex + 13) === '|sentchoice|') {
						choiceText = data.slice(nlIndex + 13);
					}
					data = data.slice(0, nlIndex);
				}

				try {
					requestData = JSON.parse(data);
				} catch (err) {}
				return this.receiveRequest(requestData, choiceText);
			}

			var log = data.split('\n');
			for (var i = 0; i < log.length; i++) {
				var logLine = log[i];

				if (logLine === '|') {
					this.callbackWaiting = false;
					this.controlsShown = false;
					this.$controls.html('');
				}

				if (logLine.substr(0, 10) === '|callback|') {
					// TODO: Maybe a more sophisticated UI for this.
					// In singles, this isn't really necessary because some elements of the UI will be
					// immediately disabled. However, in doubles/triples it might not be obvious why
					// the player is being asked to make a new decision without the following messages.
					var args = logLine.substr(10).split('|');
					var pokemon = isNaN(Number(args[1])) ? this.battle.getPokemon(args[1]) : this.battle.nearSide.active[args[1]];
					var requestData = this.request.active[pokemon ? pokemon.slot : 0];
					this.choice = undefined;
					switch (args[0]) {
					case 'trapped':
						requestData.trapped = true;
						var pokeName = pokemon.side.n === 0 ? BattleLog.escapeHTML(pokemon.name) : "The opposing " + (this.battle.ignoreOpponent || this.battle.ignoreNicks ? pokemon.speciesForme : BattleLog.escapeHTML(pokemon.name));
						this.battle.stepQueue.push('|message|' + pokeName + ' is trapped and cannot switch!');
						break;
					case 'cant':
						for (var i = 0; i < requestData.moves.length; i++) {
							if (requestData.moves[i].id === args[3]) {
								requestData.moves[i].disabled = true;
							}
						}
						args.splice(1, 1, pokemon.getIdent());
						this.battle.stepQueue.push('|' + args.join('|'));
						break;
					}
				} else if (logLine.substr(0, 7) === '|title|') { // eslint-disable-line no-empty
				} else if (logLine.substr(0, 5) === '|win|' || logLine === '|tie') {
					this.battleEnded = true;
					this.battle.stepQueue.push(logLine);
					console.log(this.id)
				//	app.removeBattle(this.id);
				} else if (logLine.substr(0, 6) === '|chat|' || logLine.substr(0, 3) === '|c|' || logLine.substr(0, 4) === '|c:|' || logLine.substr(0, 9) === '|chatmsg|' || logLine.substr(0, 10) === '|inactive|') {
					this.battle.instantAdd(logLine);
				} else {
					this.battle.stepQueue.push(logLine);
				}
			}
			this.battle.add();
			if (Dex.prefs('noanim')) this.battle.seekTurn(Infinity);
			this.updateControls();
		},
		toggleMessages: function (user) {
			var $messages = $('.chatmessage-' + user + '.revealed');
			var $button = $messages.find('button');
			if (!$messages.is(':hidden')) {
				$messages.hide();
				$button.html('<small>(' + ($messages.length) + ' line' + ($messages.length > 1 ? 's' : '') + 'from ' + user + ')</small>');
				$button.parent().show();
			} else {
				$button.html('<small>(Hide ' + ($messages.length) + ' line' + ($messages.length > 1 ? 's' : '') + ' from ' + user + ')</small>');
				$button.parent().removeClass('revealed');
				$messages.show();
			}
		},
		setHardcoreMode: function (mode) {
			this.battle.setHardcoreMode(mode);
			var id = '#' + this.el.id + ' ';
			this.$('.hcmode-style').remove();
			this.updateLayout(); // set animation delay
			if (mode) this.$el.prepend('<style class="hcmode-style">' + id + '.battle .turn,' + id + '.battle-history{display:none !important;}</style>');
			if (this.choice && this.choice.waiting) {
				this.updateControlsForPlayer();
			}
		},

		/*********************************************************
		 * Battle stuff
		 *********************************************************/

		updateControls: function () {
			if (this.battle.scene.customControls) return;
			var controlsShown = this.controlsShown;
			var switchSidesButton = '<p><button class="button" name="switchSides"><i class="fa fa-random"></i> Switch sides</button></p>';
			this.controlsShown = false;

			if (this.battle.seeking !== null) {

				// battle is seeking
				this.$controls.html('');
				return;

			} else if (!this.battle.atQueueEnd) {

				// battle is playing or paused
				if (!this.side || this.battleEnded) {
					// spectator
					if (this.battle.paused) {
						// paused
						this.$controls.html('<p><button class="button" name="resume"><i class="fa fa-play"></i><br />Play</button> <button class="button" name="rewindTurn"><i class="fa fa-step-backward"></i><br />Last turn</button><button class="button" name="skipTurn"><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />First turn</button><button class="button" name="goToEnd"><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>' + switchSidesButton);
					} else {
						// playing
						this.$controls.html('<p><button class="button" name="pause"><i class="fa fa-pause"></i><br />Pause</button> <button class="button" name="rewindTurn"><i class="fa fa-step-backward"></i><br />Last turn</button><button class="button" name="skipTurn"><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />First turn</button><button class="button" name="goToEnd"><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>' + switchSidesButton);
					}
				} else {
					// is a player
					this.$controls.html('<p>' + this.getTimerHTML() + '<button class="button" name="skipTurn"><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="goToEnd"><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>');
				}
				return;

			}

			if (this.battle.ended) {

				var replayDownloadButton = '<span style="float:right;"><a href="//' + Config.routes.replays + '/" class="button replayDownloadButton"><i class="fa fa-download"></i> Download replay</a><br /><br /><button class="button" name="saveReplay"><i class="fa fa-upload"></i> Upload and share replay</button></span>';

				// battle has ended
				if (this.side) {
					// was a player
					this.closeNotification('choice');
					this.$controls.html('<div class="controls"><p>' + replayDownloadButton + '<button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />Instant replay</button></p><p><button class="button" name="closeAndMainMenu"><strong>Main menu</strong><br /><small>(closes this battle)</small></button> <button class="button" name="closeAndRematch"><strong>Rematch</strong><br /><small>(closes this battle)</small></button></p></div>');
				} else {
					this.$controls.html('<div class="controls"><p>' + replayDownloadButton + '<button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />Instant replay</button></p>' + switchSidesButton + '</div>');
				}

			} else if (this.side) {

				// player
				this.controlsShown = true;
				if (!controlsShown || this.choice === undefined || this.choice && this.choice.waiting) {
					// don't update controls (and, therefore, side) if `this.choice === null`: causes damage miscalculations
					this.updateControlsForPlayer();
				} else {
					this.updateTimer();
				}

			} else if (!this.battle.nearSide.name || !this.battle.farSide.name) {

				// empty battle
				this.$controls.html('<p><em>Waiting for players...</em></p>');

			} else {

				// full battle
				if (this.battle.paused) {
					// paused
					this.$controls.html('<p><button class="button" name="resume"><i class="fa fa-play"></i><br />Play</button> <button class="button" name="rewindTurn"><i class="fa fa-step-backward"></i><br />Last turn</button><button class="button disabled" disabled><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />First turn</button><button class="button disabled" disabled><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>' + switchSidesButton + '<p><em>Waiting for players...</em></p>');
				} else {
					// playing
					this.$controls.html('<p><button class="button" name="pause"><i class="fa fa-pause"></i><br />Pause</button> <button class="button" name="rewindTurn"><i class="fa fa-step-backward"></i><br />Last turn</button><button class="button disabled" disabled><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="instantReplay"><i class="fa fa-undo"></i><br />First turn</button><button class="button disabled" disabled><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>' + switchSidesButton + '<p><em>Waiting for players...</em></p>');
				}

			}

			// This intentionally doesn't happen if the battle is still playing,
			// since those early-return.
			//app.topbar.updateTabbar();
		},
		updateControlsForPlayer: function () {
			this.callbackWaiting = true;

			var act = '';
			var switchables = [];
			if (this.request) {
				// TODO: investigate when to do this
				this.updateSide();
				if (this.request.ally) {
					this.addAlly(this.request.ally);
				}

				act = this.request.requestType;
				if (this.request.side) {
					switchables = this.battle.myPokemon;
				}
				if (!this.finalDecision) this.finalDecision = !!this.request.noCancel;
			}

			if (this.choice && this.choice.waiting) {
				act = '';
			}

			var type = this.choice ? this.choice.type : '';

			// The choice object:
			// !this.choice = nothing has been chosen
			// this.choice.choices = array of choice strings
			// this.choice.switchFlags = dict of pokemon indexes that have a switch pending
			// this.choice.switchOutFlags = ???
			// this.choice.freedomDegrees = in a switch request: number of empty slots that can't be replaced
			// this.choice.type = determines what the current choice screen to be displayed is
			// this.choice.waiting = true if the choice has been sent and we're just waiting for the next turn

			switch (act) {
			case 'move':
				if (!this.choice) {
					this.choice = {
						choices: [],
						switchFlags: {},
						switchOutFlags: {}
					};
				}
				this.updateMoveControls(type);
				break;

			case 'switch':
				if (!this.choice) {
					this.choice = {
						choices: [],
						switchFlags: {},
						switchOutFlags: {},
						freedomDegrees: 0,
						canSwitch: 0
					};

					if (this.request.forceSwitch !== true) {
						var faintedLength = _.filter(this.request.forceSwitch, function (fainted) {return fainted;}).length;
						var freedomDegrees = faintedLength - _.filter(switchables.slice(this.battle.pokemonControlled), function (mon) {return !mon.fainted;}).length;
						this.choice.freedomDegrees = Math.max(freedomDegrees, 0);
						this.choice.canSwitch = faintedLength - this.choice.freedomDegrees;
					}
				}
				this.updateSwitchControls(type);
				break;

			case 'team':
				if (this.battle.mySide.pokemon && !this.battle.mySide.pokemon.length) {
					// too early, we can't determine `this.choice.count` yet
					// TODO: send teamPreviewCount in the request object
					this.controlsShown = false;
					return;
				}
				if (!this.choice) {
					this.choice = {
						choices: null,
						teamPreview: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].slice(0, switchables.length),
						done: 0,
						count: 1
					};
					if (this.battle.gameType === 'multi') {
						this.choice.count = 1;
					}
					if (this.battle.gameType === 'doubles') {
						this.choice.count = 2;
					}
					if (this.battle.gameType === 'triples' || this.battle.gameType === 'rotation') {
						this.choice.count = 3;
					}
					// Request full team order if one of our Pokémon has Illusion
					for (var i = 0; i < switchables.length && i < 6; i++) {
						if (toID(switchables[i].baseAbility) === 'illusion') {
							this.choice.count = this.battle.myPokemon.length;
						}
					}
					if (this.battle.teamPreviewCount) {
						var requestCount = parseInt(this.battle.teamPreviewCount, 10);
						if (requestCount > 0 && requestCount <= switchables.length) {
							this.choice.count = requestCount;
						}
					}
					this.choice.choices = new Array(this.choice.count);
				}
				this.updateTeamControls(type);
				break;

			default:
				this.updateWaitControls();
				break;
			}
		},
		timerInterval: 0,
		getTimerHTML: function (nextTick) {
			var time = 'Timer';
			var timerTicking = (this.battle.kickingInactive && this.request && !this.request.wait && !(this.choice && this.choice.waiting)) ? ' timerbutton-on' : '';

			if (!nextTick) {
				var self = this;
				if (this.timerInterval) {
					clearInterval(this.timerInterval);
					this.timerInterval = 0;
				}
				if (timerTicking) this.timerInterval = setInterval(function () {
					var $timerButton = self.$('.timerbutton');
					if ($timerButton.length) {
						$timerButton.replaceWith(self.getTimerHTML(true));
					} else {
						clearInterval(self.timerInterval);
						self.timerInterval = 0;
					}
				}, 1000);
			} else if (this.battle.kickingInactive > 1) {
				this.battle.kickingInactive--;
				if (this.battle.graceTimeLeft) this.battle.graceTimeLeft--;
				else if (this.battle.totalTimeLeft) this.battle.totalTimeLeft--;
			}

			if (this.battle.kickingInactive) {
				var secondsLeft = this.battle.kickingInactive;
				if (secondsLeft !== true) {
					if (secondsLeft <= 10 && timerTicking) {
						timerTicking = ' timerbutton-critical';
					}
					var minutesLeft = Math.floor(secondsLeft / 60);
					secondsLeft -= minutesLeft * 60;
					time = '' + minutesLeft + ':' + (secondsLeft < 10 ? '0' : '') + secondsLeft;

					secondsLeft = this.battle.totalTimeLeft;
					if (secondsLeft) {
						minutesLeft = Math.floor(secondsLeft / 60);
						secondsLeft -= minutesLeft * 60;
						time += ' | ' + minutesLeft + ':' + (secondsLeft < 10 ? '0' : '') + secondsLeft + ' total';
					}
				} else {
					time = '-:--';
				}
			}
			return '<button name="openTimer" class="button timerbutton' + timerTicking + '"><i class="fa fa-hourglass-start"></i> ' + time + '</button>';
		},
		updateMaxMove: function () {
			var dynaChecked = this.$('input[name=dynamax]')[0].checked;
			if (dynaChecked) {
				this.$('.movebuttons-nomax').hide();
				this.$('.movebuttons-max').show();
			} else {
				this.$('.movebuttons-nomax').show();
				this.$('.movebuttons-max').hide();
			}
		},
		updateZMove: function () {
			var zChecked = this.$('input[name=zmove]')[0].checked;
			if (zChecked) {
				this.$('.movebuttons-noz').hide();
				this.$('.movebuttons-z').show();
			} else {
				this.$('.movebuttons-noz').show();
				this.$('.movebuttons-z').hide();
			}
		},
		updateTimer: function () {
			this.$('.timerbutton').replaceWith(this.getTimerHTML());
		},
		openTimer: function () {
			app.addPopup(TimerPopup, {room: this});
		},
		updateMoveControls: function (type) {
			var switchables = this.request && this.request.side ? this.battle.myPokemon : [];

			if (type !== 'movetarget') {
				while (
					switchables[this.choice.choices.length] &&
					(switchables[this.choice.choices.length].fainted || switchables[this.choice.choices.length].commanding) &&
					this.choice.choices.length + 1 < this.battle.nearSide.active.length
				) {
					this.choice.choices.push('pass');
				}
			}

			var moveTarget = this.choice ? this.choice.moveTarget : '';
			var pos = this.choice.choices.length;
			if (type === 'movetarget') pos--;

			var hpRatio = switchables[pos].hp / switchables[pos].maxhp;

			var curActive = this.request && this.request.active && this.request.active[pos];
			if (!curActive) return;
			var trapped = curActive.trapped;
			var canMegaEvo = curActive.canMegaEvo || switchables[pos].canMegaEvo;
			var canZMove = curActive.canZMove || switchables[pos].canZMove;
			var canUltraBurst = curActive.canUltraBurst || switchables[pos].canUltraBurst;
			var canDynamax = curActive.canDynamax || switchables[pos].canDynamax;
			var maxMoves = curActive.maxMoves || switchables[pos].maxMoves;
			var gigantamax = curActive.gigantamax;
			var canTerastallize = curActive.canTerastallize || switchables[pos].canTerastallize;
			if (canZMove && typeof canZMove[0] === 'string') {
				canZMove = _.map(canZMove, function (move) {
					return {move: move, target: Dex.moves.get(move).target};
				});
			}
			if (gigantamax) gigantamax = Dex.moves.get(gigantamax);

			this.finalDecisionMove = curActive.maybeDisabled || false;
			this.finalDecisionSwitch = curActive.maybeTrapped || false;
			for (var i = pos + 1; i < this.battle.nearSide.active.length; ++i) {
				var p = this.battle.nearSide.active[i];
				if (p && !p.fainted) {
					this.finalDecisionMove = this.finalDecisionSwitch = false;
					break;
				}
			}

			var requestTitle = '';
			if (type === 'move2' || type === 'movetarget') {
				requestTitle += '<button name="clearChoice">Back</button> ';
			}

			// Target selector
			if (type === 'movetarget') {
				requestTitle += 'At who? ';

				var activePos = this.battle.mySide.n > 1 ? pos + this.battle.pokemonControlled : pos;

				var targetMenus = ['', ''];
				var nearActive = this.battle.nearSide.active;
				var farActive = this.battle.farSide.active;
				var farSlot = farActive.length - 1 - activePos;

				if ((moveTarget === 'adjacentAlly' || moveTarget === 'adjacentFoe') && this.battle.gameType === 'freeforall') {
					moveTarget = 'normal';
				}

				for (var i = farActive.length - 1; i >= 0; i--) {
					var pokemon = farActive[i];
					var tooltipArgs = 'activepokemon|1|' + i;

					var disabled = false;
					if (moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
						disabled = true;
					} else if (moveTarget === 'normal' || moveTarget === 'adjacentFoe') {
						if (Math.abs(farSlot - i) > 1) disabled = true;
					}

					if (disabled) {
						targetMenus[0] += '<button disabled="disabled"></button> ';
					} else if (!pokemon || pokemon.fainted) {
						targetMenus[0] += '<button name="chooseMoveTarget" value="' + (i + 1) + '"><span class="picon" style="' + Dex.getPokemonIcon('missingno') + '"></span></button> ';
					} else {
						targetMenus[0] += '<button name="chooseMoveTarget" value="' + (i + 1) + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + (this.battle.ignoreOpponent || this.battle.ignoreNicks ? pokemon.speciesForme : BattleLog.escapeHTML(pokemon.name)) + '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}
				for (var i = 0; i < nearActive.length; i++) {
					var pokemon = nearActive[i];
					var tooltipArgs = 'activepokemon|0|' + i;

					var disabled = false;
					if (moveTarget === 'adjacentFoe') {
						disabled = true;
					} else if (moveTarget === 'normal' || moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
						if (Math.abs(activePos - i) > 1) disabled = true;
					}
					if (moveTarget !== 'adjacentAllyOrSelf' && activePos == i) disabled = true;

					if (disabled) {
						targetMenus[1] += '<button disabled="disabled" style="visibility:hidden"></button> ';
					} else if (!pokemon || pokemon.fainted) {
						targetMenus[1] += '<button name="chooseMoveTarget" value="' + (-(i + 1)) + '"><span class="picon" style="' + Dex.getPokemonIcon('missingno') + '"></span></button> ';
					} else {
						targetMenus[1] += '<button name="chooseMoveTarget" value="' + (-(i + 1)) + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}

				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + this.getTimerHTML() + '</div>' +
					'<div class="switchmenu" style="display:block">' + targetMenus[0] + '<div style="clear:both"></div> </div>' +
					'<div class="switchmenu" style="display:block">' + targetMenus[1] + '</div>' +
					'</div>'
				);
			} else {
				// Move chooser
				var hpBar = '<small class="' + (hpRatio < 0.2 ? 'critical' : hpRatio < 0.5 ? 'weak' : 'healthy') + '">HP ' + switchables[pos].hp + '/' + switchables[pos].maxhp + '</small>';
				requestTitle += ' What will <strong>' + BattleLog.escapeHTML(switchables[pos].name) + '</strong> do? ' + hpBar;

				var hasMoves = false;
				var moveMenu = '';
				var movebuttons = '';
				var activePos = this.battle.mySide.n > 1 ? pos + this.battle.pokemonControlled : pos;
				var typeValueTracker = new ModifiableValue(this.battle, this.battle.nearSide.active[activePos], this.battle.myPokemon[pos]);
				var currentlyDynamaxed = (!canDynamax && maxMoves);
				for (var i = 0; i < curActive.moves.length; i++) {
					var moveData = curActive.moves[i];
					var move = this.battle.dex.moves.get(moveData.move);
					var name = move.name;
					var pp = moveData.pp + '/' + moveData.maxpp;
					if (!moveData.maxpp) pp = '&ndash;';
					if (move.id === 'Struggle' || move.id === 'Recharge') pp = '&ndash;';
					if (move.id === 'Recharge') move.type = '&ndash;';
					if (name.substr(0, 12) === 'Hidden Power') name = 'Hidden Power';
					var moveType = this.tooltips.getMoveType(move, typeValueTracker)[0];
					var tooltipArgs = 'move|' + moveData.move + '|' + pos;
					if (moveData.disabled) {
						movebuttons += '<button disabled="disabled" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
					} else {
						movebuttons += '<button class="type-' + moveType + ' has-tooltip" name="chooseMove" value="' + (i + 1) + '" data-move="' + BattleLog.escapeHTML(moveData.move) + '" data-target="' + BattleLog.escapeHTML(moveData.target) + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
						hasMoves = true;
					}
					movebuttons += name + '<br /><small class="type">' + (moveType ? Dex.types.get(moveType).name : "Unknown") + '</small> <small class="pp">' + pp + '</small>&nbsp;</button> ';
				}
				if (!hasMoves) {
					moveMenu += '<button class="movebutton" name="chooseMove" value="0" data-move="Struggle" data-target="randomNormal">Struggle<br /><small class="type">Normal</small> <small class="pp">&ndash;</small>&nbsp;</button> ';
				} else {
					if (canZMove || canDynamax || currentlyDynamaxed) {
						var classType = canZMove ? 'z' : 'max';
						if (currentlyDynamaxed) {
							movebuttons = '';
						} else {
							movebuttons = '<div class="movebuttons-no' + classType + '">' + movebuttons + '</div><div class="movebuttons-' + classType + '" style="display:none">';
						}
						var specialMoves = canZMove ? canZMove : maxMoves.maxMoves;
						for (var i = 0; i < curActive.moves.length; i++) {
							if (specialMoves[i]) {
								// when possible, use Z move to decide type, for cases like Z-Hidden Power
								var baseMove = this.battle.dex.moves.get(curActive.moves[i].move);
								// might not exist, such as for Z status moves - fall back on base move to determine type then
								var specialMove = gigantamax || this.battle.dex.moves.get(specialMoves[i].move);
								var moveType = this.tooltips.getMoveType(specialMove.exists && !specialMove.isMax ? specialMove : baseMove, typeValueTracker, specialMove.isMax ? gigantamax || switchables[pos].gigantamax || true : undefined)[0];
								if (specialMove.isMax && specialMove.name !== 'Max Guard' && !specialMove.id.startsWith('gmax')) {
									specialMove = this.tooltips.getMaxMoveFromType(moveType);
								}
								var tooltipArgs = classType + 'move|' + baseMove.id + '|' + pos;
								if (specialMove.id.startsWith('gmax')) tooltipArgs += '|' + specialMove.id;
								var isDisabled = specialMoves[i].disabled ? 'disabled="disabled"' : '';
								movebuttons += '<button ' + isDisabled + ' class="type-' + moveType + ' has-tooltip" name="chooseMove" value="' + (i + 1) + '" data-move="' + BattleLog.escapeHTML(specialMoves[i].move) + '" data-target="' + BattleLog.escapeHTML(specialMoves[i].target) + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
								var pp = curActive.moves[i].pp + '/' + curActive.moves[i].maxpp;
								if (canZMove) {
									pp = '1/1';
								} else if (!curActive.moves[i].maxpp) {
									pp = '&ndash;';
								}
								movebuttons += specialMove.name + '<br /><small class="type">' + (moveType ? Dex.types.get(moveType).name : "Unknown") + '</small> <small class="pp">' + pp + '</small>&nbsp;</button> ';
							} else {
								movebuttons += '<button disabled="disabled">&nbsp;</button>';
							}
						}
						if (!currentlyDynamaxed) movebuttons += '</div>';
					}
					moveMenu += movebuttons;
				}
				if (canMegaEvo) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="megaevo" />&nbsp;Mega&nbsp;Evolution</label>';
				} else if (canZMove) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="zmove" />&nbsp;Z-Power</label>';
				} else if (canUltraBurst) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="ultraburst" />&nbsp;Ultra Burst</label>';
				} else if (canDynamax) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="dynamax" />&nbsp;Dynamax</label>';
				} else if (canTerastallize) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="terastallize" />&nbsp;Terastallize<br />' + Dex.getTypeIcon(canTerastallize) + '</label>';
				}
				if (this.finalDecisionMove) {
					moveMenu += '<em style="display:block;clear:both">You <strong>might</strong> have some moves disabled, so you won\'t be able to cancel an attack!</em><br/>';
				}
				moveMenu += '<div style="clear:left"></div>';

				var moveControls = (
					'<div class="movecontrols">' +
					'<div class="moveselect"><button name="selectMove">Attack</button></div>' +
					'<div class="movemenu">' + moveMenu + '</div>' +
					'</div>'
				);

				var shiftControls = '';
				if (this.battle.gameType === 'triples' && pos !== 1) {
					shiftControls += '<div class="shiftselect"><button name="chooseShift">Shift</button></div>';
				}

				var switchMenu = '';
				if (trapped) {
					switchMenu += '<em>You are trapped and cannot switch!</em><br />';
					switchMenu += this.displayParty(switchables, trapped);
				} else {
					switchMenu += this.displayParty(switchables, trapped);
					if (this.finalDecisionSwitch && this.battle.gen > 2) {
						switchMenu += '<em style="display:block;clear:both">You <strong>might</strong> be trapped, so you won\'t be able to cancel a switch!</em><br/>';
					}
				}
				var switchControls = (
					'<div class="switchcontrols">' +
					'<div class="switchselect"><button name="selectSwitch">Switch</button></div>' +
					'<div class="switchmenu">' + switchMenu + '</div>' +
					'</div>'
				);
				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + this.getTimerHTML() + '</div>' +
					moveControls + shiftControls + switchControls +
					'</div>'
				);
			}
		},
		displayParty: function (switchables, trapped) {
			var party = '';
			for (var i = 0; i < switchables.length; i++) {
				var pokemon = switchables[i];
				pokemon.name = pokemon.ident.substr(4);
				var tooltipArgs = 'switchpokemon|' + i;
				if (pokemon.fainted || i < this.battle.pokemonControlled || this.choice.switchFlags[i] || trapped) {
					party += '<button class="disabled has-tooltip" name="chooseDisabled" value="' + BattleLog.escapeHTML(pokemon.name) + (pokemon.fainted ? ',fainted' : trapped ? ',trapped' : i < this.battle.nearSide.active.length ? ',active' : '') + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + (pokemon.hp ? '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
				} else {
					party += '<button name="chooseSwitch" value="' + i + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
				}
			}
			if (this.battle.mySide.ally) party += this.displayAllyParty();
			return party;
		},
		displayAllyParty: function () {
			var party = '';
			if (!this.battle.myAllyPokemon) return '';
			var allyParty = this.battle.myAllyPokemon;
			for (var i = 0; i < allyParty.length; i++) {
				var pokemon = allyParty[i];
				pokemon.name = pokemon.ident.substr(4);
				var tooltipArgs = 'allypokemon|' + i;
				party += '<button class="disabled has-tooltip" name="chooseDisabled" value="' + BattleLog.escapeHTML(pokemon.name) + ',notMine' + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + (pokemon.hp ? '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
			}
			return party;
		},
		updateSwitchControls: function (type) {
			var pos = this.choice.choices.length;

			// Needed so it client does not freak out when only 1 mon left wants to switch out
			var atLeast1Reviving = false;
			for (var i = 0; i < this.battle.pokemonControlled; i++) {
				var pokemon = this.battle.myPokemon[i];
				if (pokemon.reviving) {
					atLeast1Reviving = true;
					break;
				}
			}

			if (type !== 'switchposition' && this.request.forceSwitch !== true && (!this.choice.freedomDegrees || atLeast1Reviving)) {
				while (!this.request.forceSwitch[pos] && pos < 6) {
					pos = this.choice.choices.push('pass');
				}
			}

			var switchables = this.request && this.request.side ? this.battle.myPokemon : [];
			var nearActive = this.battle.nearSide.active;
			var isReviving = !!switchables[pos].reviving;

			var requestTitle = '';
			if (type === 'switch2' || type === 'switchposition') {
				requestTitle += '<button name="clearChoice">Back</button> ';
			}

			// Place selector
			if (type === 'switchposition') {
				// TODO? hpbar
				requestTitle += "Which Pokémon will it switch in for?";
				var controls = '<div class="switchmenu" style="display:block">';
				for (var i = 0; i < this.battle.pokemonControlled; i++) {
					var pokemon = this.battle.myPokemon[i];
					var tooltipArgs = 'switchpokemon|' + i;
					if (pokemon && !pokemon.fainted || this.choice.switchOutFlags[i]) {
						controls += '<button disabled class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + (!pokemon.fainted ? '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
					} else if (!pokemon) {
						controls += '<button disabled></button> ';
					} else {
						controls += '<button name="chooseSwitchTarget" value="' + i + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}
				controls += '</div>';
				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + this.getTimerHTML() + '</div>' +
					controls +
					'</div>'
				);
			} else {
				if (isReviving) {
					requestTitle += "Choose a fainted Pokémon to revive!";
				} else if (this.choice.freedomDegrees >= 1) {
					requestTitle += "Choose a Pokémon to send to battle!";
				} else {
					requestTitle += "Switch <strong>" + BattleLog.escapeHTML(switchables[pos].name) + "</strong> to:";
				}

				var switchMenu = '';
				for (var i = 0; i < switchables.length; i++) {
					var pokemon = switchables[i];
					var tooltipArgs = 'switchpokemon|' + i;
					if (isReviving) {
						if (!pokemon.fainted || this.choice.switchFlags[i]) {
							switchMenu += '<button class="disabled has-tooltip" name="chooseDisabled" value="' + BattleLog.escapeHTML(pokemon.name) + (pokemon.reviving ? ',active' : !pokemon.fainted ? ',notfainted' : '') + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
						} else {
							switchMenu += '<button name="chooseSwitch" value="' + i + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
						}
					} else {
						if (pokemon.fainted || i < this.battle.pokemonControlled || this.choice.switchFlags[i]) {
							switchMenu += '<button class="disabled has-tooltip" name="chooseDisabled" value="' + BattleLog.escapeHTML(pokemon.name) + (pokemon.fainted ? ',fainted' : i < this.battle.pokemonControlled ? ',active' : '') + '" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
						} else {
							switchMenu += '<button name="chooseSwitch" value="' + i + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '">';
						}
					}
					switchMenu += '<span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + (!pokemon.fainted ? '<span class="' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
				}

				var controls = (
					'<div class="switchcontrols">' +
					'<div class="switchselect"><button name="selectSwitch">' + (isReviving ? 'Revive' : 'Switch') + '</button></div>' +
					'<div class="switchmenu">' + switchMenu + '</div>' +
					'</div>'
				);
				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + this.getTimerHTML() + '</div>' +
					controls +
					'</div>'
				);
				this.selectSwitch();
			}
		},
		updateTeamControls: function (type) {
			var switchables = this.request && this.request.side ? this.battle.myPokemon : [];
			var maxIndex = Math.min(switchables.length, 24);

			var requestTitle = "";
			if (this.choice.done) {
				requestTitle = '<button name="clearChoice">Back</button> ' + "What about the rest of your team?";
			} else {
				requestTitle = "How will you start the battle?";
			}

			var switchMenu = '';
			for (var i = 0; i < maxIndex; i++) {
				var oIndex = this.choice.teamPreview[i] - 1;
				var pokemon = switchables[oIndex];
				var tooltipArgs = 'switchpokemon|' + oIndex;
				if (i < this.choice.done) {
					switchMenu += '<button disabled="disabled" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + '</button> ';
				} else {
					switchMenu += '<button name="chooseTeamPreview" value="' + i + '" class="has-tooltip" data-tooltip="' + BattleLog.escapeHTML(tooltipArgs) + '"><span class="picon" style="' + Dex.getPokemonIcon(pokemon) + '"></span>' + BattleLog.escapeHTML(pokemon.name) + '</button> ';
				}
			}

			var controls = (
				'<div class="switchcontrols">' +
				'<div class="switchselect"><button name="selectSwitch">' + (this.choice.done ? '' + "Choose a Pokémon for slot " + (this.choice.done + 1) : "Choose Lead") + '</button></div>' +
				'<div class="switchmenu">' + switchMenu + '</div>' +
				'</div>'
			);
			this.$controls.html(
				'<div class="controls">' +
				'<div class="whatdo">' + requestTitle + this.getTimerHTML() + '</div>' +
				controls +
				'</div>'
			);
			this.selectSwitch();
		},
		updateWaitControls: function () {
			var buf = '<div class="controls">';
			buf += this.getPlayerChoicesHTML();
			if (!this.battle.nearSide.name || !this.battle.farSide.name || !this.request) {
				if (this.battle.kickingInactive) {
					buf += '<p><button class="button" name="setTimer" value="off">Stop timer</button> <small>&larr; Your opponent has disconnected. This will give them more time to reconnect.</small></p>';
				} else {
					buf += '<p><button class="button" name="setTimer" value="on">Claim victory</button> <small>&larr; Your opponent has disconnected. Click this if they don\'t reconnect.</small></p>';
				}
			}
			this.$controls.html(buf + '</div>');
		},

		getPlayerChoicesHTML: function () {
			var buf = '<p>' + this.getTimerHTML();
			if (!this.choice || !this.choice.waiting) {
				return buf + '<em>Waiting for opponent...</em></p>';
			}
			buf += '<small>';

			if (this.choice.teamPreview) {
				var myPokemon = this.battle.mySide.pokemon;
				var leads = [];
				var back = [];
				var leadCount = this.battle.gameType === 'doubles' ? 2 : (this.battle.gameType === 'triples' ? 3 : 1);
				for (var i = 0; i < leadCount; i++) {
					leads.push(myPokemon[this.choice.teamPreview[i] - 1].speciesForme);
				}
				buf += leads.join(', ') + ' will be sent out first.<br />';
				for (var i = leadCount; i < this.choice.count; i++) {
					back.push(myPokemon[this.choice.teamPreview[i] - 1].speciesForme);
				}
				if (back.length) buf += back.join(', ') + ' are in the back.<br />';
			} else if (this.choice.choices && this.request && this.battle.myPokemon) {
				var myPokemon = this.battle.myPokemon;
				for (var i = 0; i < this.choice.choices.length; i++) {
					var parts = this.choice.choices[i].split(' ');
					switch (parts[0]) {
					case 'move':
						var move;
						if (this.request.active[i].maxMoves && !this.request.active[i].canDynamax) { // it's a max move
							move = this.request.active[i].maxMoves.maxMoves[parseInt(parts[1], 10) - 1].move;
						} else { // it's a normal move
							move = this.request.active[i].moves[parseInt(parts[1], 10) - 1].move;
						}
						var target = '';
						buf += myPokemon[i].speciesForme + ' will ';
						if (parts.length > 2) {
							var targetPos = parts[2];
							if (targetPos === 'mega') {
								buf += 'Mega Evolve, then ';
								targetPos = parts[3];
							}
							if (targetPos === 'zmove') {
								move = this.request.active[i].canZMove[parseInt(parts[1], 10) - 1].move;
								targetPos = parts[3];
							}
							if (targetPos === 'ultra') {
								buf += 'Ultra Burst, then ';
								targetPos = parts[3];
							}
							if (targetPos === 'dynamax') {
								move = this.request.active[i].maxMoves.maxMoves[parseInt(parts[1], 10) - 1].move;
								buf += 'Dynamax, then ';
								targetPos = parts[3];
							}
							if (targetPos === 'terastallize') {
								buf += 'Terastallize, then ';
								targetPos = parts[3];
							}
							if (targetPos) {
								var targetActive = this.battle.farSide.active;
								if (targetPos < 0) {
									// Targeting your own side in doubles / triples
									targetActive = this.battle.nearSide.active;
									targetPos = -targetPos;
									if (this.battle.gameType !== 'freeforall') {
										target += 'your ';
									}
								}
								if (targetActive[targetPos - 1]) {
									target += targetActive[targetPos - 1].speciesForme;
								} else {
									target += 'slot ' + targetPos; // targeting an empty slot
								}
							}
						}
						buf += 'use ' + Dex.moves.get(move).name + (target ? ' at ' + target : '') + '.<br />';
						break;
					case 'switch':
						buf += '' + myPokemon[parts[1] - 1].speciesForme + ' will switch in';
						if (myPokemon[i]) {
							buf += ', replacing ' + myPokemon[i].speciesForme;
						}
						buf += '.<br />';
						break;
					case 'shift':
						buf += myPokemon[i].speciesForme + ' will shift position.<br />';
						break;
					}
				}
			}
			buf += '</small></p>';
			if (!this.finalDecision && !this.battle.hardcoreMode) {
				buf += '<p><small><em>Waiting for opponent...</em></small> <button class="button" name="undoChoice">Cancel</button></p>';
			}
			return buf;
		},

		/**
		 * Sends a decision; pass it an array of choices like ['move 1', 'switch 2']
		 * and it'll send `/choose move 1,switch 2|3`
		 * (where 3 is the rqid).
		 *
		 * (The rqid helps verify that the decision is sent in response to the
		 * correct request.)
		 */
		sendDecision: function (message) {
			let token = localStorage.getItem("token");
			if(!token) return alert("An Unexpected error has occured, please log in again");
			if (!$.isArray(message)) return this.send('/' + message + '|' + this.request.rqid);
			var buf = '/choose ';
			for (var i = 0; i < message.length; i++) {
				if (message[i]) buf += message[i] + ',';
			}
			this.send(buf.substr(0, buf.length - 1) + '|' + this.request.rqid);
		},
		request: null,
		receiveRequest: function (request, choiceText) {
			if (!request) {
				this.side = '';
				return;
			}

			if (!this.autoTimerActivated && Storage.prefs('autotimer') && !this.battle.ended) {
				this.setTimer('on');
				this.autoTimerActivated = true;
			}

			request.requestType = 'move';
			if (request.forceSwitch) {
				request.requestType = 'switch';
			} else if (request.teamPreview) {
				request.requestType = 'team';
			} else if (request.wait) {
				request.requestType = 'wait';
			}

			this.choice = choiceText ? {waiting: true} : null;
			this.finalDecision = this.finalDecisionMove = this.finalDecisionSwitch = false;
			this.request = request;
			if (request.side) {
				this.updateSideLocation(request.side);
			}
			this.notifyRequest();
			this.controlsShown = false;
			this.updateControls();
		},
		notifyRequest: function () {
			var oName = this.battle.farSide.name;
			if (oName) oName = " against " + oName;
			switch (this.request.requestType) {
			case 'move':
				this.notify("Your move!", "Move in your battle" + oName, 'choice');
				break;
			case 'switch':
				this.notify("Your switch!", "Switch in your battle" + oName, 'choice');
				break;
			case 'team':
				this.notify("Team preview!", "Choose your team order in your battle" + oName, 'choice');
				break;
			}
		},
		updateSideLocation: function (sideData) {
			if (!sideData.id) return;
			this.side = sideData.id;
			if (this.battle.mySide.sideid !== this.side) {
				this.battle.setPerspective(this.side);
				this.$chat = this.$chatFrame.find('.inner');
			}
		},
		updateSide: function () {
			var sideData = this.request.side;
			this.battle.myPokemon = sideData.pokemon;
			this.battle.setPerspective(sideData.id);
			for (var i = 0; i < sideData.pokemon.length; i++) {
				var pokemonData = sideData.pokemon[i];
				if (this.request.active && this.request.active[i]) pokemonData.canGmax = this.request.active[i].gigantamax || false;
				this.battle.parseDetails(pokemonData.ident.substr(4), pokemonData.ident, pokemonData.details, pokemonData);
				this.battle.parseHealth(pokemonData.condition, pokemonData);
				pokemonData.hpDisplay = Pokemon.prototype.hpDisplay;
				pokemonData.getPixelRange = Pokemon.prototype.getPixelRange;
				pokemonData.getFormattedRange = Pokemon.prototype.getFormattedRange;
				pokemonData.getHPColorClass = Pokemon.prototype.getHPColorClass;
				pokemonData.getHPColor = Pokemon.prototype.getHPColor;
			}
		},
		addAlly: function (allyData) {
			this.battle.myAllyPokemon = allyData.pokemon;
			for (var i = 0; i < allyData.pokemon.length; i++) {
				var pokemonData = allyData.pokemon[i];
				this.battle.parseDetails(pokemonData.ident.substr(4), pokemonData.ident, pokemonData.details, pokemonData);
				this.battle.parseHealth(pokemonData.condition, pokemonData);
				pokemonData.hpDisplay = Pokemon.prototype.hpDisplay;
				pokemonData.getPixelRange = Pokemon.prototype.getPixelRange;
				pokemonData.getFormattedRange = Pokemon.prototype.getFormattedRange;
				pokemonData.getHPColorClass = Pokemon.prototype.getHPColorClass;
				pokemonData.getHPColor = Pokemon.prototype.getHPColor;
				pokemonData.side = this.battle.mySide.ally;
			}
		},

		// buttons
		joinBattle: function () {
			this.send('/joinbattle');
		},
		setTimer: function (setting) {
			this.send('/timer ' + setting);
		},
		forfeit: function () {
			this.send('/forfeit');
		},
		saveReplay: function () {
			this.send('/savereplay');
		},
		openBattleOptions: function () {
			app.addPopup(BattleOptionsPopup, {battle: this.battle, room: this});
		},
		clickReplayDownloadButton: function (e) {
			var filename = (this.battle.tier || 'Battle').replace(/[^A-Za-z0-9]/g, '');

			// ladies and gentlemen, JavaScript dates
			var date = new Date();
			filename += '-' + date.getFullYear();
			filename += (date.getMonth() >= 9 ? '-' : '-0') + (date.getMonth() + 1);
			filename += (date.getDate() >= 10 ? '-' : '-0') + date.getDate();

			filename += '-' + toID(this.battle.p1.name);
			filename += '-' + toID(this.battle.p2.name);

			e.currentTarget.href = BattleLog.createReplayFileHref(this);
			e.currentTarget.download = filename + '.html';

			e.stopPropagation();
		},
		switchSides: function () {
			this.battle.switchSides();
		},
		pause: function () {
			this.tooltips.hideTooltip();
			this.battlePaused = true;
			this.battle.pause();
			this.updateControls();
		},
		resume: function () {
			this.tooltips.hideTooltip();
			this.battlePaused = false;
			this.battle.play();
			this.updateControls();
		},
		instantReplay: function () {
			this.tooltips.hideTooltip();
			this.request = null;
			this.battlePaused = false;
			this.battle.reset();
			this.battle.play();
		},
		skipTurn: function () {
			this.battle.skipTurn();
		},
		rewindTurn: function () {
			if (this.battle.turn) {
				this.battle.seekTurn(this.battle.turn - 1);
			}
		},
		goToEnd: function () {
			this.battle.seekTurn(Infinity);
		},
		register: function (userid) {
			var registered = app.user.get('registered');
			if (registered && registered.userid !== userid) registered = false;
			if (!registered && userid === app.user.get('userid')) {
				app.addPopup(RegisterPopup);
			}
		},
		closeAndMainMenu: function () {
			this.close();
			app.focusRoom('');
		},
		closeAndRematch: function () {
			app.rooms[''].requestNotifications();
			app.rooms[''].challenge(this.battle.farSide.name, this.battle.tier);
			this.close();
			app.focusRoom('');
		},

		// choice buttons
		chooseMove: function (pos, e) {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			if (pos !== undefined) { // pos === undefined if called by chooseMoveTarget()
				var nearActive = this.battle.nearSide.active;
				var isMega = !!(this.$('input[name=megaevo]')[0] || '').checked;
				var isZMove = !!(this.$('input[name=zmove]')[0] || '').checked;
				var isUltraBurst = !!(this.$('input[name=ultraburst]')[0] || '').checked;
				var isDynamax = !!(this.$('input[name=dynamax]')[0] || '').checked;
				var isTerastal = !!(this.$('input[name=terastallize]')[0] || '').checked;

				var target = e.getAttribute('data-target');
				var choosableTargets = {normal: 1, any: 1, adjacentAlly: 1, adjacentAllyOrSelf: 1, adjacentFoe: 1};

				this.choice.choices.push('move ' + pos + (isMega ? ' mega' : '') + (isZMove ? ' zmove' : '') + (isUltraBurst ? ' ultra' : '') + (isDynamax ? ' dynamax' : '') + (isTerastal ? ' terastallize' : ''));
				if (nearActive.length > 1 && target in choosableTargets) {
					this.choice.type = 'movetarget';
					this.choice.moveTarget = target;
					this.updateControlsForPlayer();
					return false;
				}
			}

			this.endChoice();
		},
		chooseMoveTarget: function (posString) {
			this.choice.choices[this.choice.choices.length - 1] += ' ' + posString;
			this.chooseMove();
		},
		chooseShift: function () {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			this.choice.choices.push('shift');
			this.endChoice();
		},
		chooseSwitch: function (pos) {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			if (this.battle.myPokemon[this.choice.choices.length].reviving) {
				this.choice.choices.push('switch ' + (parseInt(pos, 10) + 1));
				this.endChoice();
				return;
			}

			if (pos !== undefined) { // pos === undefined if called by chooseSwitchTarget()
				this.choice.switchFlags[pos] = true;
				if (this.choice.freedomDegrees >= 1) {
					// Request selection of a Pokémon that will be switched out.
					this.choice.type = 'switchposition';
					this.updateControlsForPlayer();
					return false;
				}
				// Default: left to right.
				this.choice.switchOutFlags[this.choice.choices.length] = true;
				this.choice.choices.push('switch ' + (parseInt(pos, 10) + 1));
				this.endChoice();
				return;
			}

			// After choosing the position to which a pokemon will switch in (Doubles/Triples end-game).
			if (!this.request || this.request.requestType !== 'switch') return false; //??
			if (this.choice.canSwitch > _.filter(this.choice.choices, function (choice) {return choice;}).length) {
				// More switches are pending.
				this.choice.type = 'switch2';
				this.updateControlsForPlayer();
				return false;
			}

			this.endTurn();
		},
		chooseSwitchTarget: function (posString) {
			var slotSwitchIn = 0; // one-based
			for (var i in this.choice.switchFlags) {
				if (this.choice.choices.indexOf('switch ' + (+i + 1)) === -1) {
					slotSwitchIn = +i + 1;
					break;
				}
			}
			this.choice.choices[posString] = 'switch ' + slotSwitchIn;
			this.choice.switchOutFlags[posString] = true;
			this.chooseSwitch();
		},
		chooseTeamPreview: function (pos) {
			if (!this.choice) return;
			pos = parseInt(pos, 10);
			this.tooltips.hideTooltip();
			if (this.choice.count) {
				var temp = this.choice.teamPreview[pos];
				this.choice.teamPreview[pos] = this.choice.teamPreview[this.choice.done];
				this.choice.teamPreview[this.choice.done] = temp;

				this.choice.done++;

				if (this.choice.done < Math.min(this.choice.teamPreview.length, this.choice.count)) {
					this.choice.type = 'team2';
					this.updateControlsForPlayer();
					return false;
				}
			} else {
				this.choice.teamPreview = [pos + 1];
			}

			this.endTurn();
		},
		chooseDisabled: function (data) {
			this.tooltips.hideTooltip();
			data = data.split(',');
			if (data[1] === 'fainted') {
				app.addPopupMessage("" + data[0] + " has no energy left to battle!");
			} else if (data[1] === 'notMine') {
				app.addPopupMessage("You cannot decide for your partner!");
			} else if (data[1] === 'trapped') {
				app.addPopupMessage("You are trapped and cannot select " + data[0] + "!");
			} else if (data[1] === 'active') {
				app.addPopupMessage("" + data[0] + " is already in battle!");
			} else if (data[1] === 'notfainted') {
				app.addPopupMessage("" + data[0] + " still has energy to battle!");
			} else {
				app.addPopupMessage("" + data[0] + " is already selected!");
			}
		},
		endChoice: function () {
			var choiceIndex = this.choice.choices.length - 1;
			if (!this.nextChoice()) {
				this.endTurn();
			} else if (this.request.partial) {
				for (var i = choiceIndex; i < this.choice.choices.length; i++) {
					this.sendDecision(this.choice.choices[i]);
				}
			}
		},
		nextChoice: function () {
			var choices = this.choice.choices;
			var nearActive = this.battle.nearSide.active;

			if (this.request.requestType === 'switch' && this.request.forceSwitch !== true) {
				while (choices.length < this.battle.pokemonControlled && !this.request.forceSwitch[choices.length]) {
					choices.push('pass');
				}
				if (choices.length < this.battle.pokemonControlled) {
					this.choice.type = 'switch2';
					this.updateControlsForPlayer();
					return true;
				}
			} else if (this.request.requestType === 'move') {
				var requestDetails = this.request && this.request.side ? this.battle.myPokemon : [];
				while (choices.length < this.battle.pokemonControlled &&
						(!nearActive[choices.length] || requestDetails[choices.length].commanding)) {
					choices.push('pass');
				}

				if (choices.length < this.battle.pokemonControlled) {
					this.choice.type = 'move2';
					this.updateControlsForPlayer();
					return true;
				}
			}

			return false;
		},
		endTurn: function () {
			var act = this.request && this.request.requestType;
			if (act === 'team') {
				if (this.choice.teamPreview.length >= 10) {
					this.sendDecision('team ' + this.choice.teamPreview.join(','));
				} else {
					this.sendDecision('team ' + this.choice.teamPreview.join(''));
				}
			} else {
				if (act === 'switch') {
					// Assert that the remaining Pokémon won't switch, even though
					// the player could have decided otherwise.
					for (var i = 0; i < this.battle.pokemonControlled; i++) {
						if (!this.choice.choices[i]) this.choice.choices[i] = 'pass';
					}
				}

				if (this.choice.choices.length >= (this.choice.count || this.battle.pokemonControlled || this.request.active.length)) {
					this.sendDecision(this.choice.choices);
				}

				if (!this.finalDecision) {
					var lastChoice = this.choice.choices[this.choice.choices.length - 1];
					if (lastChoice.substr(0, 5) === 'move ' && this.finalDecisionMove) {
						this.finalDecisionMove = true;
					} else if (lastChoice.substr(0, 7) === 'switch' && this.finalDecisionSwitch) {
						this.finalDecisionSwitch = true;
					}
				}
			}
			this.closeNotification('choice');

			this.choice.waiting = true;
			this.updateControlsForPlayer();
		},
		undoChoice: function (pos) {
			this.send('/undo');
			this.notifyRequest();

			this.clearChoice();
		},
		clearChoice: function () {
			this.choice = null;
			this.updateControlsForPlayer();
		},
		leaveBattle: function () {
			this.tooltips.hideTooltip();
			this.send('/leavebattle');
			this.side = '';
			this.closeNotification('choice');
		},
		selectSwitch: function () {
			this.tooltips.hideTooltip();
			this.$controls.find('.controls').attr('class', 'controls switch-controls');
		},
		selectMove: function () {
			this.tooltips.hideTooltip();
			this.$controls.find('.controls').attr('class', 'controls move-controls');
		}
	}, {
		readReplayFile: function (file) {
			var reader = new FileReader();
			reader.onload = function (e) {
				app.removeRoom('battle-uploadedreplay');
				var html = e.target.result;
				var titleStart = html.indexOf('<title>');
				var titleEnd = html.indexOf('</title>');
				var title = 'Uploaded Replay';
				if (titleStart >= 0 && titleEnd > titleStart) {
					title = html.slice(titleStart + 7, titleEnd - 1);
					var colonIndex = title.indexOf(':');
					var hyphenIndex = title.lastIndexOf('-');
					if (hyphenIndex > colonIndex + 2) {
						title = title.substring(colonIndex + 2, hyphenIndex - 1);
					} else {
						title = title.substring(colonIndex + 2);
					}
				}
				var index1 = html.indexOf('<script type="text/plain" class="battle-log-data">');
				var index2 = html.indexOf('<script type="text/plain" class="log">');
				if (index1 < 0 && index2 < 0) return alert("Unrecognized HTML file: Only replay files are supported.");
				if (index1 >= 0) {
					html = html.slice(index1 + 50);
				} else if (index2 >= 0) {
					html = html.slice(index2 + 38);
				}
				var index3 = html.indexOf('</script>');
				html = html.slice(0, index3);
				html = html.replace(/\\\//g, '/');
				app.receive('>battle-uploadedreplay\n|init|battle\n|title|' + title + '\n' + html);
				app.receive('>battle-uploadedreplay\n|expire|Uploaded replay');
			};
			reader.readAsText(file);
		}
	});

	var ForfeitPopup = this.ForfeitPopup = Popup.extend({
		type: 'semimodal',
		initialize: function (data) {
			this.room = data.room;
			this.gameType = data.gameType;
			var buf = '<form><p>';
			if (this.gameType === 'battle') {
				buf += 'Forfeiting makes you lose the battle.';
			} else if (this.gameType === 'help') {
				buf += 'Leaving the room will close the ticket.';
			} else if (this.gameType === 'room') {
				buf += 'Are you sure you want to exit this room?';
			} else {
				// game
				buf += 'Forfeiting makes you lose the game.';
			}
			if (this.gameType === 'help') {
				buf += ' Are you sure?</p><p><label><input type="checkbox" name="closeroom" checked /> Close room</label></p>';
				buf += '<p><button type="submit"><strong>Close ticket</strong></button> ';
			} else if (this.gameType === 'room') {
				buf += ' </p><p><button type="leaveRoom" name="leaveRoom"><strong>Close room</strong></button>';
			} else {
				buf += ' Are you sure?</p><p><label><input type="checkbox" name="closeroom" checked /> Close after forfeiting</label></p>';
				buf += '<p><button type="submit"><strong>Forfeit</strong></button> ';
			}
			if (this.gameType === 'battle' && this.room.battle && !this.room.battle.rated) {
				buf += '<button type="button" name="replacePlayer">Replace player</button> ';
			}
			buf += '<button type="button" name="close" class="autofocus">Cancel</button></p></form>';
			this.$el.html(buf);
		},
		replacePlayer: function (data) {
			var room = this.room;
			var self = this;
			app.addPopupPrompt("Replacement player's username", "Replace player", function (target) {
				if (!target) return;
				var side = (room.battle.mySide.id === room.battle.p1.id ? 'p1' : 'p2');
				room.leaveBattle();
				room.send('/addplayer ' + target + ', ' + side);
				self.close();
			});
		},
		submit: function (data) {
			this.room.send('/forfeit');
			if (this.gameType === 'battle') this.room.battle.forfeitPending = true;
			if (this.$('input[name=closeroom]')[0].checked) {
				app.removeRoom(this.room.id);
			}
			this.close();
		},
		leaveRoom: function (data) {
			this.room.send('/noreply /leave');
			this.close();
		}
	});

	var BattleOptionsPopup = this.BattleOptionsPopup = Popup.extend({
		initialize: function (data) {
			this.battle = data.battle;
			this.room = data.room;
			var rightPanelBattlesPossible = (MainMenuRoom.prototype.bestWidth + BattleRoom.prototype.minWidth < $(window).width());
			var buf = '<p><strong>In this battle</strong></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="hardcoremode"' + (this.battle.hardcoreMode ? ' checked' : '') + '/> Hardcore mode (hide info not shown in-game) (beta)</label></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="ignorespects"' + (this.battle.ignoreSpects ? ' checked' : '') + '/> Ignore spectators</label></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="ignoreopp"' + (this.battle.ignoreOpponent ? ' checked' : '') + '/> Ignore opponent</label></p>';
			buf += '<p><strong>All battles</strong></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="ignorenicks"' + (Dex.prefs('ignorenicks') ? ' checked' : '') + ' /> Ignore nicknames</label></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="allignorespects"' + (Dex.prefs('ignorespects') ? ' checked' : '') + '/> Ignore spectators</label></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="allignoreopp"' + (Dex.prefs('ignoreopp') ? ' checked' : '') + '/> Ignore opponent</label></p>';
			buf += '<p><label class="optlabel"><input type="checkbox" name="autotimer"' + (Dex.prefs('autotimer') ? ' checked' : '') + '/> Automatically start timer</label></p>';
			if (rightPanelBattlesPossible) buf += '<p><label class="optlabel"><input type="checkbox" name="rightpanelbattles"' + (Dex.prefs('rightpanelbattles') ? ' checked' : '') + ' /> Open new battles on the right side</label></p>';
			buf += '<p><button name="close">Close</button></p>';
			this.$el.html(buf);
		},
		events: {
			'change input[name=ignorespects]': 'toggleIgnoreSpects',
			'change input[name=ignorenicks]': 'toggleIgnoreNicks',
			'change input[name=ignoreopp]': 'toggleIgnoreOpponent',
			'change input[name=hardcoremode]': 'toggleHardcoreMode',
			'change input[name=allignorespects]': 'toggleAllIgnoreSpects',
			'change input[name=allignoreopp]': 'toggleAllIgnoreOpponent',
			'change input[name=autotimer]': 'toggleAutoTimer',
			'change input[name=rightpanelbattles]': 'toggleRightPanelBattles'
		},
		toggleHardcoreMode: function (e) {
			this.room.setHardcoreMode(!!e.currentTarget.checked);
			if (this.battle.hardcoreMode) {
				this.battle.add('Hardcore mode ON: Information not available in-game is now hidden.');
			} else {
				this.battle.add('Hardcore mode OFF: Information not available in-game is now shown.');
			}
		},
		toggleIgnoreSpects: function (e) {
			this.battle.ignoreSpects = !!e.currentTarget.checked;
			this.battle.add('Spectators ' + (this.battle.ignoreSpects ? '' : 'no longer ') + 'ignored.');
			var $messages = $('.battle-log').find('.chat').has('small').not(':contains(\u2605), :contains(\u2606)');
			if (!$messages.length) return;
			if (this.battle.ignoreSpects) {
				$messages.hide();
			} else {
				$messages.show();
			}
		},
		toggleAllIgnoreSpects: function (e) {
			var ignoreSpects = !!e.currentTarget.checked;
			Storage.prefs('ignorespects', ignoreSpects);
			if (ignoreSpects && !this.battle.ignoreSpects) this.$el.find('input[name=ignorespects]').click();
		},
		toggleIgnoreNicks: function (e) {
			this.battle.ignoreNicks = !!e.currentTarget.checked;
			Storage.prefs('ignorenicks', this.battle.ignoreNicks);
			this.battle.add('Nicknames ' + (this.battle.ignoreNicks ? '' : 'no longer ') + 'ignored.');
			this.battle.resetToCurrentTurn();
		},
		toggleIgnoreOpponent: function (e) {
			this.battle.ignoreOpponent = !!e.currentTarget.checked;
			this.battle.add('Opponent ' + (this.battle.ignoreOpponent ? '' : 'no longer ') + 'ignored.');
			this.battle.resetToCurrentTurn();
		},
		toggleAllIgnoreOpponent: function (e) {
			var ignoreOpponent = !!e.currentTarget.checked;
			Storage.prefs('ignoreopp', ignoreOpponent);
			if (ignoreOpponent && !this.battle.ignoreOpponent) this.$el.find('input[name=ignoreopp]').click();
		},
		toggleAutoTimer: function (e) {
			var autoTimer = !!e.currentTarget.checked;
			Storage.prefs('autotimer', autoTimer);
			if (autoTimer) {
				this.room.setTimer('on');
				this.room.autoTimerActivated = true;
			}
		},
		toggleRightPanelBattles: function (e) {
			Storage.prefs('rightpanelbattles', !!e.currentTarget.checked);
		}
	});

	var TimerPopup = this.TimerPopup = Popup.extend({
		initialize: function (data) {
			this.room = data.room;
			if (this.room.battle.kickingInactive) {
				this.$el.html('<p><button name="timerOff"><strong>Stop timer</strong></button></p>');
			} else {
				this.$el.html('<p><button name="timerOn"><strong>Start timer</strong></button></p>');
			}
		},
		timerOff: function () {
			this.room.setTimer('off');
			this.close();
		},
		timerOn: function () {
			this.room.setTimer('on');
			this.close();
		}
	});

}).call(this, jQuery);
