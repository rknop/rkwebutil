# rkwebutil

Several utilities useful for web applications (and maybe some other things):

* rkwebutil.js : a set of random javascript routines I use myself
* config.py : a python config system that reads yaml files which can override each other
* rkauth : an authentication system for webaps using flask, flask-session, and Postgres

rkwebutil is (c) 2023-2024 by Robert Knop, and is available under the BSD 3-clause license (see LICENSE)

---

## config.py

A class that reads a YAML file and then provides access to the contents of that yaml hierarchy via period-separated key strings.  Has provisions for including other yaml files that will be pre- or post-loaded to seed or replace the config variables.  Documentation is in the python docstring for the `Config` class in `config.py`

---

## rkwebutil.js

Several random javascript utilties that I use all the time myself.

* `rkWebUtil.wipeDiv(div)` : remove all children of document element `div` (it doesn't actually have to be a div element)
* `rkWebUtil.elemaker(elemtype, parent, inprops)` : shorthand for creating a document element.  (MORE DOCUMENTATION NEEDED.)
* `rkWebUtil.button(parent, title, callback)` : shorthand for creating a button.  (MORE DOCUMENTATION NEEDED.)
* `rkWebUtil.popupMenu(items, callbacks, classes, title=null, titleclasses=[], hrclasses=[])` : todo
* `rkWebUtil.parseStandardDateString(datestring)` : create a `Date` object from a string of the form `yyyy-mm-dd hh:mm:ss`, assuming that the datestring is in UTC.
* `rkWebUtil.dateFormat(date)` : convert a `Date` to `yyyy-mm-dd hh:mm:ss` in the local time zone.
* `rkWebUtil.dateUTCFormat(date)` : convert a `Date` to `yyyy-mm-dd hh:mm:ss` in UTC.
* `rkWebUtil.validateWidgetDate(datestr)` : todo
* `rkWebUtil.hideOrShow(widget, parameter, hideparams, showparams, displaytype="block")` : todo
* `rkWebUtil.b64encode` : encode a Uint8Array (or something equivalent) to a text string.  Does what I think javascript's btoa really ought to do, but doesn't.  Not a fast implementation, be careful using it with big binary blobs.
* `rkWebUtil.b64decode` : decode a text string to a Unit8Array binary blob.  Does what I think javascript's atob really ough to do, but doesn't.  Not a fast implementation, be careful using it with long strings.
* `rkWebUtil.colorIntToCSSColor(colint)` : takes an integer representing a color and makes a `#rrggbb` CSS hex string from it.  The integer assumes that r, g, and b are all in the range 0-255, and the integer is `r*(256^2)+g*256+b`.
* `rkWebUtil.Connector(app)` : a class for sending HTTP requests via XMLHttpRequst, interpreting a JSON response, and calling callbacks with the data from the JSON reponse.
* `rkWebUtil.Tabbed` : todo

---

## rkauth

A system for defining users and authenticating them to a web server.  Assumes use of Postgres, flask, and flask-session

Includes files:

* `flaskauth.py`
* `rkauth.js`
* `resetpasswd_start.js`

No user passwords are stored server-side, nor are transmitted during authentication.  The server stores a user's RSA public key and AES-encrypted private key (as well as salt and an initilization vector for generating the AES key), but it does *not* store the user's password in any form, nor does it store the unencrypted private key.  When the user logs in, the server sends the encrypted private key (with salt and init. vector) and a challenge string (a randomly-generated v4 uuid) encrypted with the public key.  The javasript code client-side uses a user-entered password to decrypt the private key.  It then uses that private key to decrypt the challenge string, and sends that back to the server.  If the server receives the right challenge string, it considers the user authenticated.  This way, the user's password is only ever used client side.  If the server's database is compromised, user private keys cannot be recovered without breaking the encryption (or somehow determining the user's password).

When a user's password is reset, a RSA public and private key are generated client side on the user's browser.  The private key is then encrypted using an AES key generated from the user's password.  The RSA public key, the encrypted key, and the salt and initialization vector used in creating the AES key are all sent to the server.  The private key is never sent over the internet unencrypted, and the password is never sent over the internet.

Password resets are handled by creating a random link (a v4 uuid) that expires after 1 hour.  This link is sent to the email address that the database has for that user.  A user going to that link is able to reset their password.  This does mean, as with all systems that send password reset links through email, that user accounts can be hijacked by intercepting the email.

TODO : web ap ways to add and delete users.  Deleting the users should also remove any sessions attached to those users.  (Right now, users are added and removed by just poking at the SQL database directly.)