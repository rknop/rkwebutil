# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import sys
import re
import time
import json
import uuid
import requests
import pytest
import logging
import pathlib
import json

import psycopg2

import selenium
from selenium.common.exceptions import NoSuchElementException
import selenium.webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.remote.webelement import WebElement

sys.path.insert( 0, str(pathlib.Path(__file__).parent.parent) )
from rkwebutil.rkauth_client import rkAuthClient

class AuthTestBase:
    url = None

    @pytest.fixture(scope='class')
    def user_created( self, database ):
        try:
            cursor = database.cursor()
            cursor.execute( "INSERT INTO authuser(id,username,displayname,email) "
                            "VALUES ('fdc718c3-2880-4dc5-b4af-59c19757b62d','browser_test',"
                            "'Test User','testuser@mailhog')" )
            database.commit()
            yield True
        finally:
            cursor = database.cursor()
            cursor.execute( "DELETE FROM authuser WHERE id='fdc718c3-2880-4dc5-b4af-59c19757b62d'" )
            database.commit()


    @pytest.fixture(scope='class')
    def groups_created( self, user_created, database ):
        try:
            cursor = database.cursor()
            cursor.execute( "INSERT INTO authgroup(id,name,description) "
                            "VALUES ('3a4c85a1-c786-4895-8554-bbc2cd1c4238','testgroup1','Test Group 1')" )
            cursor.execute( "INSERT INTO authgroup(id,name,description) "
                            "VALUES ('ca73d2cb-82f2-4ae6-8e36-e7b2bd649532','testgroup2','Test Group 2')" )
            cursor.execute( "INSERT INTO authgroup(id,name,description) "
                            "VALUES ('d291755d-7441-404a-a89d-572a13aae10b','testgroup3','Test Group 3')" )
            cursor.execute( "INSERT INTO auth_user_group(userid,groupid) "
                            "VALUES ('fdc718c3-2880-4dc5-b4af-59c19757b62d','3a4c85a1-c786-4895-8554-bbc2cd1c4238')" )
            cursor.execute( "INSERT INTO auth_user_group(userid,groupid) "
                            "VALUES ('fdc718c3-2880-4dc5-b4af-59c19757b62d','ca73d2cb-82f2-4ae6-8e36-e7b2bd649532')" )
            database.commit()
            yield True
        finally:
            cursor = database.cursor()
            cursor.execute( "DELETE FROM authgroup WHERE id IN ('3a4c85a1-c786-4895-8554-bbc2cd1c4238',"
                            "'ca73d2cb-82f2-4ae6-8e36-e7b2bd649532','d291755d-7441-404a-a89d-572a13aae10b')" )
            database.commit()


    @pytest.fixture(scope='class')
    def browser( self, user_created, groups_created ):
        opts = selenium.webdriver.FirefoxOptions()
        opts.add_argument( "--headless" )

        ff = selenium.webdriver.Firefox( options=opts )
        # Need this next one since the test env. uses a self-signed cert
        ff.accept_untrusted_certs = True
        yield ff
        ff.close()
        ff.quit()

    @pytest.fixture(scope='class')
    def load_frontpage( self, browser ):
        browser.get( self.url )
        el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
        assert el.text == 'Request Password Reset'

    def findresetpasswordbutton( self, browser ):
        try:
            statusdiv = browser.find_element( By.ID, 'status-div' )
            button = statusdiv.find_element( By.TAG_NAME, 'button' )
            if button.text != 'Email Password Reset Link':
                return None
            return button
        except Exception as e:
            return None

    @pytest.fixture(scope='class')
    def click_password_reset( self, browser, load_frontpage ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        p = statusdiv.find_element( By.TAG_NAME, 'p' )
        assert p.text == 'Request Password Reset'
        p.click()
        button = WebDriverWait( browser, timeout=10 ).until( self.findresetpasswordbutton )
        return button


    def waitforresetemailsent( self, browser ):
        try:
            statusdiv = browser.find_element( By.ID, 'status-div' )
            p = statusdiv.find_element( By.TAG_NAME, 'p' )
            if p.text == 'Password reset link(s) sent for browser_test.':
                return p
            else:
                return None
        except Exception as ex:
            return None

    @pytest.fixture(scope='class')
    def password_reset_link( self, database, browser, click_password_reset ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        username = statusdiv.find_element( By.ID, 'login_username' )
        username.clear()
        username.send_keys( 'browser_test' )
        click_password_reset.click()
        p = WebDriverWait( browser, timeout=10 ).until( self.waitforresetemailsent )
        assert p.text == 'Password reset link(s) sent for browser_test.'

        # This is ugly; I should find a better way to wait for mailhog to get the mail
        time.sleep(2)

        res = requests.get( 'http://mailhog:8025/api/v2/messages' )
        assert res.status_code == 200
        blob = json.loads( res.text )
        assert len( blob['items'] ) > 0
        # Empirically, the first item is the most recent
        msg = blob['items'][0]
        hdrs = msg['Content']['Headers']
        assert hdrs['From'] == ['rkwebutil test <nobody@nowhere.org>']
        assert hdrs['To'] == ['testuser@mailhog']
        assert hdrs['Subject'] == ['rkwebutil test password reset']
        body = msg['Content']['Body']
        match = re.search( rf"^Somebody requested.*({self.url}auth/resetpassword\?uuid=[0-9a-f\-]+)$",
                           body, flags=re.DOTALL )
        assert match is not None

        yield match.group( 1 )

        cursor = database.cursor()
        cursor.execute( "DELETE FROM passwordlink" )
        database.commit()

    @pytest.fixture(scope='class')
    def reset_password( self, database, browser, password_reset_link ):
        browser.get( password_reset_link )
        time.sleep(3)
        el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.ID, 'resetpasswd_linkid' ) )
        assert el.get_attribute('name') == 'linkuuid'
        assert el.tag_name == 'input'
        pw = browser.find_element( By.ID, 'reset_password' )
        conf = browser.find_element( By.ID, 'reset_confirm_password' )
        button = browser.find_element( By.ID, 'setnewpassword_button' )
        pw.clear()
        pw.send_keys( 'gratuitous' )
        conf.clear()
        conf.send_keys( 'gratuitous' )
        # I don't know why, but the alert timeout expired if I didn't sleep before clicking
        button.click()
        time.sleep( 1 )
        alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
        assert alert.text == 'Password changed'
        alert.dismiss()

        yield True

        cursor = database.cursor()
        cursor.execute( "UPDATE authuser SET pubkey=NULL,privkey=NULL WHERE username='test'" )
        database.commit()

    def lookforloggedin( self, browser ):
        try:
            statusdiv = browser.find_element( By.ID, 'status-div' )
            p = statusdiv.find_element( By.TAG_NAME, 'p' )
            if p.text[0:37] == "Logged in as browser_test (Test User)":
                return p
            else:
                return None
        except Exception as ex:
            return None

    @pytest.fixture(scope='class')
    def get_frontpage_after_reset_password( self, browser, reset_password ):
        browser.get( self.url )
        el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
        assert el.text == 'Request Password Reset'

    @pytest.fixture(scope='class')
    def login( self, browser, get_frontpage_after_reset_password ):
        browser.get( self.url )
        el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
        assert el.text == 'Request Password Reset'
        statusdiv = browser.find_element( By.ID, 'status-div' )
        username = statusdiv.find_element( By.ID, 'login_username' )
        password = statusdiv.find_element( By.ID, 'login_password' )
        button = statusdiv.find_element( By.TAG_NAME, 'button' )
        username.clear()
        username.send_keys( 'browser_test' )
        password.clear()
        password.send_keys( 'gratuitous' )
        time.sleep( 1 )
        button.click()
        el = WebDriverWait( browser, timeout=10 ).until( self.lookforloggedin )

    @pytest.fixture(scope='class')
    def logout( self, browser, login ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        p = statusdiv.find_element( By.TAG_NAME, 'p' )
        span = statusdiv.find_element( By.TAG_NAME, 'span' )
        span.click()
        # This is overkill, but give it time to go through the whole reload
        # I should probably put a wait after this, but, eh.
        time.sleep(5)

    def check_login_prompt( self, browser ):
        inputelems = ( 'login_username', 'login_password' )
        for elem in [ 'login_username', 'login_password', 'status-div', 'main-div' ]:
            e = browser.find_element( value=elem )
            assert type(e) == WebElement
            if elem in inputelems:
                assert e.tag_name == 'input'
            else:
                assert e.tag_name == 'div'
            assert e.is_displayed()

    def test_frontpage( self, browser, load_frontpage ):
        assert browser.title == 'RKWebutil Test'
        with pytest.raises( NoSuchElementException ):
            browser.find_element( value='this_element_does_not_exist' )
        self.check_login_prompt( browser )

    def test_nosuchuser( self, browser, load_frontpage ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        username = statusdiv.find_element( By.ID, 'login_username' )
        button = statusdiv.find_element( By.TAG_NAME, 'button' )
        username.clear()
        username.send_keys( 'no_such_user' )
        time.sleep(1)
        button.click()
        alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
        assert alert.text == "HTTP status 500 : No such user no_such_user"
        alert.dismiss()

    def test_no_password( self, browser, load_frontpage ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        username = statusdiv.find_element( By.ID, 'login_username' )
        password = statusdiv.find_element( By.ID, 'login_password' )
        button = statusdiv.find_element( By.TAG_NAME, 'button' )
        username.clear()
        password.clear()
        username.send_keys( 'browser_test' )
        password.send_keys( 'nothing to see here' )
        time.sleep(1)
        button.click()
        alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
        assert alert.text == "HTTP status 500 : User browser_test does not have a password set yet"
        alert.dismiss()

    def test_request_reset( self, browser, click_password_reset ):
        email_button = click_password_reset
        statusdiv = browser.find_element( value='status-div' )
        for elem in ( 'login_username', 'login_email' ):
            e = statusdiv.find_element( value=elem )
            assert type(e) == WebElement
            assert e.tag_name == 'input'
            assert e.is_displayed()

    def test_reset_email( self, browser, password_reset_link, database ):
        match = re.search( rf'^{self.url}auth/resetpassword\?uuid=([0-9a-f\-]+)$', password_reset_link )
        assert match is not None
        cursor = database.cursor()
        cursor.execute( "SELECT l.id FROM passwordlink l INNER JOIN authuser a ON l.userid=a.id "
                        "WHERE a.username='browser_test' ORDER BY expires DESC" )
        rows = cursor.fetchall()
        # assert len(rows) > 0
        assert len(rows) == 1
        assert rows[0]['id'] == match.group(1)

    def test_reset_password( self, browser, reset_password, database ):
        cursor = database.cursor()
        cursor.execute( "SELECT * FROM authuser WHERE username='browser_test'" )
        rows = cursor.fetchall()
        assert len(rows) == 1
        assert len(rows[0]['pubkey']) > 20
        assert set(rows[0]['privkey']) == { 'salt', 'iv', 'privkey' }
        cursor.execute( "SELECT * FROM passwordlink" )
        assert cursor.rowcount == 0

    def test_bad_password( self, browser, get_frontpage_after_reset_password ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        username = statusdiv.find_element( By.ID, 'login_username' )
        password = statusdiv.find_element( By.ID, 'login_password' )
        button = statusdiv.find_element( By.TAG_NAME, 'button' )
        username.clear()
        password.clear()
        username.send_keys( 'browser_test' )
        password.send_keys( 'this is not the right password' )
        time.sleep(1)
        button.click()
        alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
        assert alert.text == "Incorrect username or password"
        alert.dismiss()

    def test_login( self, browser, login ):
        statusdiv = browser.find_element( By.ID, 'status-div' )
        p = statusdiv.find_element( By.TAG_NAME, 'p' )
        assert p.text == 'Logged in as browser_test (Test User) — Log Out'

    def test_logout( self, browser, logout ):
        self.check_login_prompt( browser )
        h2 = browser.find_element( By.TAG_NAME, "h2" )
        assert h2.text == "Not Logged In"


class rkAuthClientTestBase:
    url = None

    @pytest.fixture
    def user( self ):
        pubkey = '''-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArBn0QI7Z2utOz9VFCoAL
+lWSeuxOprDba7O/7EBxbPev/MsayA+MB+ILGo2UycGHs9TPBWihC9ACWPLG0tJt
q5FrqWaHPmvXMT5rb7ktsAfpZSZEWdrPfLCvBdrFROUwMvIaw580mNVm4PPb5diG
pM2b8ZtAr5gHWlBH4gcni/+Jv1ZKYh0b3sUOru9+IStvFs6ijySbHFz1e/ejP0kC
LQavMj1avBGfaEil/+NyJb0Ufdy8+IdgGJMCwFIZ15HPiIUFDRYWPsilX8ik+oYU
QBZlFpESizjEzwlHtdnLrlisQR++4dNtaILPqefw7BYMRDaf1ggYiy5dl0+ZpxYO
puvcLQlPqt8iO1v3IEuPCdMqhmmyNno0AQZq+Fyc21xRFdwXvFReuOXcgvZgZupI
XtYQTStR9t7+HL5G/3yIa1utb3KRQbFkOXRXHyppUEIr8suK++pUORrAablj/Smj
9TCCe8w5eESmQ+7E/h6M84nh3t8kSBibOlcLaNywKm3BEedQXmtu4KzLQbibZf8h
Ll/jFHv5FKYjMBbVw3ouvMZmMU+aEcaSdB5GzQWhpHtGmp+fF0bPztgTdQZrArja
Y94liagnjIra+NgHOzdRd09sN9QGZSHDanANm24lZHVWvTdMU+OTAFckY560IImB
nRVct/brmHSH0KXam2bLZFECAwEAAQ==
-----END PUBLIC KEY-----
'''
        privkey ={ "iv": "pXz7x5YA79o+Qg4w",
                   "salt": "aBtXrLT7ds9an38nW7EgbQ==",
                   "privkey": "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"
                  }
        _id = uuid.uuid4()

        conn = psycopg2.connect( host='postgres', port=5432, dbname='test_rkwebutil',
                                 user='postgres', password='fragile' )
        cursor = conn.cursor()
        cursor.execute( "INSERT INTO authuser( id, username, displayname, email, pubkey, privkey ) "
                        "VALUES (%(id)s, %(username)s, %(displayname)s, %(email)s, %(pubkey)s, %(privkey)s)",
                        { 'id': str(_id),
                          'username': 'test',
                          'displayname': 'test user',
                          'email': 'test@mailhog',
                          'pubkey': pubkey,
                          'privkey': json.dumps(privkey)
                         } )
        conn.commit()
        conn.close()

        yield True

        conn = psycopg2.connect( host='postgres', port=5432, dbname='test_rkwebutil',
                                 user='postgres', password='fragile' )
        cursor = conn.cursor()
        cursor.execute( "DELETE FROM authuser WHERE id=%(id)s", { 'id': str(_id) } )
        conn.commit()
        conn.close()

    @pytest.fixture
    def client( self, user ):
        client = rkAuthClient( self.url, 'test', 'test_password', verify=False )
        client.verify_logged_in()
        return client

    def test_send( self, client ):
        data = client.send( '/auth/isauth' )
        assert isinstance( data, dict )
        assert data['status']
        assert data['userdisplayname'] == 'test user'
        assert data['useremail'] == 'test@mailhog'
        assert data['username'] == 'test'

    def test_post( self, client ):
        res = client.post( '/auth/isauth' )
        assert isinstance( res, requests.Response )
        assert res.status_code == 200
        assert res.headers.get('Content-Type')[:16] == 'application/json'
        data = res.json()
        assert data['status']
        assert data['userdisplayname'] == 'test user'
        assert data['useremail'] == 'test@mailhog'
        assert data['username'] == 'test'


class TestFlaskAuth(AuthTestBase):
    url = "https://flask:8080/"

class TestApacheFlaskAuth(AuthTestBase):
    url = "https://apache:8084/"

class TestWebpyAuth(AuthTestBase):
    url = "https://webpy:8082/ap.py/"

class TestrkAuthClientFlask(rkAuthClientTestBase):
    url = "https://flask:8080/"
