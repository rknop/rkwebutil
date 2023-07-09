import { rkAuth } from "./rkauth.js"

const urlmatch = new RegExp( '^(.*)(/[^/]+/)auth/resetpassword\\?uuid=[0-9a-f\-]+$' )
var loc = String( window.location );
var match = String(window.location).match( urlmatch );
if ( match == null ) {
    window.alert( "Error!  Failed to parse URL" );
    die( "Reset password broken." );
}
const webapurl = match[2];

rkAuth.started = false;
rkAuth.init_interval = window.setInterval(
    function()
    {
        var requestdata, renderer;
        if ( document.readyState == "complete" ) {
            if ( !rkAuth.started ) {
                rkAuth.started = true;
                window.clearInterval( rkAuth.init_interval );
                let div = document.getElementById( "authdiv" );
                let auther = new rkAuth( div, webapurl, null );
                let button = document.getElementById( "setnewpassword_button" );
                button.addEventListener( "click", function() { auther.getPrivKey() } );
            }
        }
    },
    100);
            
    
