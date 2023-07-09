# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023 by Robert Knop
#
# rkwebutil is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the
# Free Software Foundation, either version 3 of the License, or (at your
# option) any later version.
#
# rkwebutil is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
# for more details.
#
# You should have received a copy of the GNU General Public License
# along with rkwebutil. If not, see <https://www.gnu.org/licenses/>.

import time
import requests
import re
import json
import pytest

import psycopg2
import psycopg2.extras

import selenium
import selenium.webdriver
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.by import By

@pytest.fixture(scope='module')
def database():
    conn = psycopg2.connect( host='postgres', user='postgres', password='fragile', dbname='test_rkwebutil',
                             cursor_factory=psycopg2.extras.RealDictCursor )
    return conn

@pytest.fixture(scope='module')
def browser():
    opts = selenium.webdriver.FirefoxOptions()
    opts.add_argument( "--headless" )
    ff = selenium.webdriver.Firefox( options=opts )
    yield ff
    ff.close()
    ff.quit()

@pytest.fixture(scope='module')
def load_frontpage( browser ):
    browser.get( "http://webserver:8080/ap.py/" )
    el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
    assert el.text == 'Request Password Reset'

def findresetpasswordbutton( browser ):
    try:
        statusdiv = browser.find_element( By.ID, 'status-div' )
        button = statusdiv.find_element( By.TAG_NAME, 'button' )
        if button.text != 'Email Password Reset Link':
            return None
        return button
    except Exception as e:
        return None
            
@pytest.fixture(scope='module')
def click_password_reset( browser, load_frontpage ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    p = statusdiv.find_element( By.TAG_NAME, 'p' )
    assert p.text == 'Request Password Reset'
    p.click()
    button = WebDriverWait( browser, timeout=10 ).until( findresetpasswordbutton )
    return button


def waitforresetemailsent( browser ):
    try:
        statusdiv = browser.find_element( By.ID, 'status-div' )
        p = statusdiv.find_element( By.TAG_NAME, 'p' )
        if p.text == 'Password reset link(s) sent for test.':
            return p
        else:
            return None
    except Exception as ex:
        return None

@pytest.fixture(scope='module')
def password_reset_link( database, browser, click_password_reset ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    username = statusdiv.find_element( By.ID, 'login_username' )
    username.clear()
    username.send_keys( 'test' )
    click_password_reset.click()
    p = WebDriverWait( browser, timeout=10 ).until( waitforresetemailsent )
    assert p.text == 'Password reset link(s) sent for test.'

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
    match = re.search( "^Somebody requested.*(http://webserver:8080/ap.py/auth/resetpassword\?uuid=[0-9a-f\-]+)$",
                       body, flags=re.DOTALL )
    assert match is not None

    yield match.group( 1 )

    cursor = database.cursor()
    cursor.execute( "DELETE FROM passwordlink" )
    database.commit()
    
@pytest.fixture(scope='module')
def reset_password( database, browser, password_reset_link ):
    browser.get( password_reset_link )
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
    time.sleep(1)
    button.click()
    alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
    assert alert.text == 'Password changed'
    alert.dismiss()

    yield True

    cursor = database.cursor()
    cursor.execute( "UPDATE authuser SET pubkey=NULL,privkey=NULL WHERE username='test'" )
    database.commit()
    
def lookforloggedin( browser ):
    try:
        statusdiv = browser.find_element( By.ID, 'status-div' )
        p = statusdiv.find_element( By.TAG_NAME, 'p' )
        if p.text[0:29] == "Logged in as test (Test User)":
            return p
        else:
            return None
    except Exception as ex:
        return None

@pytest.fixture(scope='module')
def get_frontpage_after_reset_password( browser, reset_password ):
    browser.get( "http://webserver:8080/ap.py/" )
    el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
    assert el.text == 'Request Password Reset'
    
@pytest.fixture(scope='module')
def login( browser ):
    browser.get( "http://webserver:8080/ap.py/" )
    el = WebDriverWait( browser, timeout=10 ).until( lambda d: d.find_element(By.CLASS_NAME, 'link') )
    assert el.text == 'Request Password Reset'
    statusdiv = browser.find_element( By.ID, 'status-div' )
    username = statusdiv.find_element( By.ID, 'login_username' )
    password = statusdiv.find_element( By.ID, 'login_password' )
    button = statusdiv.find_element( By.TAG_NAME, 'button' )
    username.clear()
    username.send_keys( 'test' )
    password.clear()
    password.send_keys( 'gratuitous' )
    time.sleep( 1 )
    button.click()
    el = WebDriverWait( browser, timeout=10 ).until( lookforloggedin )

@pytest.fixture(scope='module')
def logout( browser, login ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    p = statusdiv.find_element( By.TAG_NAME, 'p' )
    span = statusdiv.find_element( By.TAG_NAME, 'span' )
    span.click()
    # This is overkill, but give it time to go through the whole reload
    # I should probably put a wait after this, but, eh.
    time.sleep(5)
