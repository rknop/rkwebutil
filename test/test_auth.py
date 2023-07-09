import re
import time
import requests
import pytest

from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait

def check_login_prompt( browser ):
    inputelems = ( 'login_username', 'login_password' )
    for elem in [ 'login_username', 'login_password', 'status-div', 'main-div' ]:
        e = browser.find_element( value=elem )
        assert type(e) == WebElement
        if elem in inputelems:
            assert e.tag_name == 'input'
        else:
            assert e.tag_name == 'div'
        assert e.is_displayed()

def test_frontpage( browser, load_frontpage ):
    assert browser.title == 'RKWebutil Test'
    with pytest.raises( NoSuchElementException ):
        browser.find_element( value='this_element_does_not_exist' )
    check_login_prompt( browser )

def test_nosuchuser( browser, load_frontpage ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    username = statusdiv.find_element( By.ID, 'login_username' )
    button = statusdiv.find_element( By.TAG_NAME, 'button' )
    username.clear()
    username.send_keys( 'no_such_user' )
    time.sleep(1)
    button.click()
    alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
    assert alert.text == "No such user no_such_user"
    alert.dismiss()

def test_no_password( browser, load_frontpage ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    username = statusdiv.find_element( By.ID, 'login_username' )
    password = statusdiv.find_element( By.ID, 'login_password' )
    button = statusdiv.find_element( By.TAG_NAME, 'button' )
    username.clear()
    password.clear()
    username.send_keys( 'test' )
    password.send_keys( 'nothing to see here' )
    time.sleep(1)
    button.click()
    alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
    assert alert.text == "User test does not have a password set yet."
    alert.dismiss()
        
def test_request_reset( browser, click_password_reset ):
    email_button = click_password_reset
    statusdiv = browser.find_element( value='status-div' )
    for elem in ( 'login_username', 'login_email' ):
        e = statusdiv.find_element( value=elem )
        assert type(e) == WebElement
        assert e.tag_name == 'input'
        assert e.is_displayed()
        
def test_reset_email( browser, password_reset_link, database ):
    match = re.search( '^http://webserver:8080/ap.py/auth/resetpassword\?uuid=([0-9a-f\-]+)$', password_reset_link )
    assert match is not None
    cursor = database.cursor()
    cursor.execute( "SELECT l.id FROM passwordlink l INNER JOIN authuser a ON l.userid=a.id "
                    "WHERE a.username='test' ORDER BY expires DESC" )
    rows = cursor.fetchall()
    # assert len(rows) > 0
    assert len(rows) == 1
    assert rows[0]['id'] == match.group(1)
    
def test_reset_password( browser, reset_password, database ):
    cursor = database.cursor()
    cursor.execute( "SELECT * FROM authuser WHERE username='test'" )
    rows = cursor.fetchall()
    assert len(rows) == 1
    assert len(rows[0]['pubkey']) > 20
    assert len(rows[0]['privkey']) > 20
    cursor.execute( "SELECT * FROM passwordlink" )
    assert cursor.rowcount == 0

def test_bad_password( browser, get_frontpage_after_reset_password ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    username = statusdiv.find_element( By.ID, 'login_username' )
    password = statusdiv.find_element( By.ID, 'login_password' )
    button = statusdiv.find_element( By.TAG_NAME, 'button' )
    username.clear()
    password.clear()
    username.send_keys( 'test' )
    password.send_keys( 'this is not the right password' )
    time.sleep(1)
    button.click()
    alert = WebDriverWait( browser, timeout=10 ).until( expected_conditions.alert_is_present() )
    assert alert.text == "Incorrect username or password"
    alert.dismiss()
    
def test_login( browser, login ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    p = statusdiv.find_element( By.TAG_NAME, 'p' )
    assert p.text == 'Logged in as test (Test User) — Log Out'

def test_logout( browser, logout ):
    check_login_prompt( browser )
    h2 = browser.find_element( By.TAG_NAME, "h2" )
    assert h2.text == "Not Logged In"
    
