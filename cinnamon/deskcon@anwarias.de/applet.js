const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
//const Panel = imports.ui.popupMenu;
const Gettext = imports.gettext.domain('cinnamon-applets');
const _ = Gettext.gettext;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;

const iface = '<node> \
    <interface name="de.anwarias.desktopconnector"> \
        <method name="stats"> \
            <arg type="s" direction="out" name="json"/> \
        </method> \
        <method name="notification"> \
            <arg type="s" direction="out" name="text"/> \
        </method> \
        <method name="compose_sms"> \
            <arg type="s" direction="in" name="host"/> \
        </method> \
        <method name="ping_device"> \
            <arg type="s" direction="in" name="host"/> \
        </method> \
        <method name="send_file"> \
            <arg type="s" direction="in" name="host"/> \
        </method> \
        <method name="show_settings"> \
        </method> \
        <method name="setup_device"> \
        </method> \
        <signal name="changed" /> \
        <signal name="new_notification" /> \
    </interface> \
</node>';

const DBusClient = new Lang.Class({
    Name: 'DBusClient',
    _init: function() {
        this.ProxyClass = Gio.DBusProxy.makeProxyWrapper(iface);

        this.proxy = new this.ProxyClass(Gio.DBus.session,
            'de.anwarias.desktopconnector',
            '/de/anwarias/desktopconnector', Lang.bind(this, this._onError));
        this.changesig = this.proxy.connectSignal("changed", updatehandler);
        this.notificationsig = this.proxy.connectSignal("new_notification", notificationhandler);
    },
    _onError: function(obj, error) {
        if (error) {
            print('error :',error);
        }
    },

    destroy: function() {
        this.proxy.disconnectSignal(this.changesig);
        this.proxy.disconnectSignal(this.notificationsig);
    },
    getProxy: function() {
        return this.proxy;
    },
    getStats: function() {
        let info = this.proxy.call_sync('stats', null, 0, 1000, null);
        let ui = info.get_child_value(0);
        let jsonstr = ui.get_string()[0];
        return jsonstr;
    },
    getNotification: function() {
        let info = this.proxy.call_sync('notification', null, 0, 1000, null);
        let ui = info.get_child_value(0);
        let jsonstr = ui.get_string()[0];
        return jsonstr;
    },
    composesms: function(ip, port) {
        host = ip + ":" + port;
        let parameters = new GLib.Variant('(s)', [host]);
        this.proxy.call_sync('compose_sms', parameters, 0, 1000, null);
    },
    pingdevice: function(ip, port) {
        host = ip + ":" + port;
        let parameters = new GLib.Variant('(s)', [host]);
        this.proxy.call_sync('ping_device', parameters, 0, 1000, null);
    },
    sendfile: function(ip, port) {
        host = ip + ":" + port;
        let parameters = new GLib.Variant('(s)', [host]);
        this.proxy.call_sync('send_file', parameters, 0, 1000, null);
    },
    showsettings: function() {
        this.proxy.call_sync("show_settings", null, 0, 1000, null);
    },
    setupdevice: function() {
        this.proxy.call_sync("setup_device", null, 0, 1000, null);
    },
});

function updatehandler() {
    let jsonstr = "{}";
    try {
        jsonstr = dbusclient.getStats();
    } catch(e) {
        jsonstr = "{}"
    }

    let phonesObject = JSON.parse(jsonstr);

    let phonesArray = phonesObject.phones;

    for (var pos in phonesArray) {
        let phone = phonesArray[pos];

        if (regPhones[phone.uuid] == undefined) {
            let deviceItem = new DeviceMenuItem(phone);
            regPhones[phone.uuid] = deviceItem;

            _indicator.menu.addMenuItem(deviceItem.infoitem, 0);
            _indicator.menu.addMenuItem(deviceItem.notificationsmenuitem, 1);
            _indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 2);
        }
        else {
            regPhones[phone.uuid].update(phone);
        }
    }
}

function notificationhandler() {
    let not = dbusclient.getNotification().split("::", 2);
    let uuid = not[0];
    let text = not[1];

    if (regPhones[uuid] == undefined) {

    }
    else {
        regPhones[uuid].addnotification(text);
    }
}

const DeviceMenuItem = new Lang.Class({
    Name: 'DeviceMenuItem',

    _init: function(info) {
        this.infoitem = new PopupMenu.PopupSubMenuItem(info.name);
        let pingb = new PopupMenu.PopupMenuItem("Ping");
        let sendfileb = new PopupMenu.PopupMenuItem("Send File(s)");
        let composeb = new PopupMenu.PopupMenuItem("Compose Message");
        composeb.connect('activate', Lang.bind(this, this.composing));
        pingb.connect('activate', Lang.bind(this, this.ping));
        sendfileb.connect('activate', Lang.bind(this, this.sendfileb));

        this._ip = info.ip;
        this._port = info.controlport;
        let can_message = info.canmessage;

        if(can_message) {
            this.composeb = composeb;
            this.infoitem.menu.addMenuItem(this.composeb);
        }
        this.infoitem.menu.addMenuItem(sendfileb);
        this.infoitem.menu.addMenuItem(pingb);

        this.notificationsmenuitem = new PopupMenu.PopupSubMenuItem("Notifications");
        let clearb = new PopupMenu.PopupMenuItem("Clear");
        clearb.connect('activate', Lang.bind(this, this.clearnotifications));
        this.notificationsArray = new Array();
        this.notificationsmenuitem.menu.addMenuItem(clearb);
        this.notificationsmenutiem.actor.hide();
        this.update(info);
    },

    composemsg: function(event) {
        dbusclient.composesms(this._ip, this._port);
        _indicator.menu.close();
    },
    ping: function(event) {
        dbusclient.pingdevice(this._ip, this._port);
        _indicator.menu.close();
    },
    sendfile: function(event) {
        dbusclient.sendfile(this._ip, this._port);
        _indicator.menu.close();
    },
    addnotification: function(text) {
        let newnot = new PopupMenuItem(text, {reactive: false});
        this.notificationsArray.push(newnot);
        newnot.connect('clicked', Lang.bind(this, function() { newnot.destroy(); }));
        this.notificationsmenuitem.menu.addMenuItem(newnot, 0);
        this.notificationsmenuitem.actor.show();
    },
    clearnotification: function() {
        for (i=0;i<this.notificationsArray.lenth;i++) {
            let not = this.notificationsArray.pop();
            not.destroy();
        }
        this.notificationsmenuitem.actor.hide();
    },
    update: function(info){
        let name = info.name;

        //Batterystring
        let batterystr = "Bat: "+ info.batter+"%";
        if (info.batterystate) {
            batterystr += " (*)";
        }
        //Volumestring
        let volumestr = "Vol: "+info.volume+"%";
        //Storagestring
        let storagestr = "Used: "+info.storage+"%";
        //missedstrs
        let missedmsgstr = "";
        let missedcallstr = "";
        if (info.missedsmscount > 0) { missedmsgstr = "unread Messages "+info.missedsmscount; }
        if (info.missedcallcount > 0) { missedcallstr = "missed Calls "+info.missedcallcount; }
        let newtxt = (name+"\n"+batterystr+" / "+volumestr+" / "+storagestr);

        if (missedmsgstr != "") {
            newtxt = newtxt+"\n"+missedmsgstr
        }

        if (missedcallstr != "") {
            newtxt = newtxt+"\n"+missedcallstr
        }
        this.infoitem.label.set_text(newtxt);
        let can_message = info.canmessage;
        if (can_message && typeof this.composeb == 'undefined') {
            this.composeb = new PopupMenu.PopupMenuItem("Compose Message");
            this.composeb.connect('activate', Lang.bind(this, this.composemsg));
            this.infoitem.menu.addMenuItem(this.composeb);
        }
    },
});

const PhonesMenu = new Lang.Class({
    Name: 'PhonesMenu.PhoneMenu',
    Extends: PanelMenu.Button,
    _init: function(){
        this.parent(0.0, 'PhoneMenu');
        let hbox = new St.BoxLayout({style_class: 'panel-status-menu-box' });
        let icon = new St.Icon({icon_name: 'sphone-symbolic',
                                style_class: 'system-status-icon'});
        hbox.add_children(icon);
        this.actor.add_child(hbox);
        let settingsbutton = new PopupMenu.PopupMenuItem("Settings");
        let setupdevicebutton = new PopupMenu.PopupMenuItem("Setup new Device");

        settingsbutton.connect('activate', Lang.bind(this, this.show_settings));
        setupdevicebutton.connect('activate', Lang.bind(this, this.setup_device));
        this.menu.addMenuItem(setupdevicebutton);
        this.menu.addMenuItem(settingsbutton);
        this.menu.addMenuItem(new PopupMenu.PopupSparatorMenuItem());
    },
    show: function() {
        this.actor.show();
        updatehandler();
    },
    destroy: function() {
        this.parent();
    },
    show_settings: function() {
        dbusclient.showsettings();
    },
    setup_device: function() {
        dbusclient.setup_device();
    },
});

let _indicator;
let regPhones = {};
let dbusclient;

//               ===  Applet configuration === 

function MyApplet(orientation, panel_hight, instance_id) {
    this._init(orientation, panel_hight, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,
    _init: function(orientation, panel_hight, instance_id){
        Applet.IconApplet.prototype._init.call(this, orientation, panel_hight, instance_id);
        try {
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.set_applet_tooltip(_("Deskcon"));
        } catch(e) {
            global.logError(e);
        }
        dbusclient = new DBusClient();
        this.menu = new Applet.AppletPopupMenu(this,orientation);
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem("Text Menuitem"));
        _indicator = new PhonesMenu;
        this.menu.addMenuItem('phonesMenu', _indicator, 1);
        updatehandler();
    },
    on_applet_clicked: function(event) {
        this.menu.toggle();
    },
};

function main(metadata, orientation, panel_hight, instance_id) {
    return new MyApplet(orientation, panel_hight, instance_id)
}
