import re
import requests
import pytest

from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By


def test_frontpage( browser, load_frontpage ):
    assert browser.title == 'RKWebutil Test'
    with pytest.raises( NoSuchElementException ):
        browser.find_element( value='this_element_does_not_exist' )
    inputelems = ( 'login_username', 'login_password' )
    for elem in [ 'login_username', 'login_password', 'status-div', 'main-div' ]:
        e = browser.find_element( value=elem )
        assert type(e) == WebElement
        if elem in inputelems:
            assert e.tag_name == 'input'
        else:
            assert e.tag_name == 'div'
        assert e.is_displayed()
        
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
    
def test_login( browser, login ):
    statusdiv = browser.find_element( By.ID, 'status-div' )
    p = statusdiv.find_element( By.TAG_NAME, 'p' )
    assert p.text == 'Logged in as test (Test User) — Log Out'
