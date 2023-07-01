import { rkAuth } from "./rkauth.js"
import { rkWebUtil } from "./rkwebutil.js"

var webapurl = "/example_ap.py/";

var exampleap = function() {}

exampleap.prototype.init = function() {
    var self = this;
    
    this.statusdiv = document.getElementById( "status-div" );
    this.maindiv = document.getElementById( "main-div" );
    if ( this.statusdiv == null ) {
        window.alert( "Couldn't find status div!  This should never happen." );
        return;
    }
    this.auth = new rkAuth( this.statusdiv, webapurl, function() { self.render() } );
    this.auth.checkAuth();
}

// **********************************************************************


exampleap.prototype.render = function() {
    this.show_or_prompt_login();
    rkWebUtil.wipediv( this.maindiv );
    if ( ! this.auth.authenticated ) {
        rkWebUtil.elemaker( "p", this.maindiv, "Not logged in." );
    }
    else {
        rkWebUtil.elemaker( "p", this.maindiv, "Hello world." );
    }
}

// **********************************************************************

exampleap.prototype.show_or_prompt_login = function() {
    var self = this;
    rkWebUtil.wipeDiv( this.statusdiv );
    if ( this.auth.authenticated ) {
        let p = rkWebUtil.elemaker( "p", this.statusdiv, { "classes": [ "smaller", "italic" ] } );
        p.appendChild( document.createTextNode( "Logged in as " + this.auth.username +
                                                " (" + this.auth.userdisplayname + ") — " ) );
        rkWebUtil.elemaker( "span", p,
                            { "classes": [ "link" ],
                              "text": "Log Out",
                              "click": function() {
                                  self.auth.logout( function() { self.render(); } )
                              }
                            }
                          );
    }
    else {
        this.auth.showLoginUI();
    }
}
    
// **********************************************************************

export { exampleap }
