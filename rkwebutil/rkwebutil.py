import re
import datetime
import dateutil
import pytz
import uuid


# ======================================================================

class ErrorMsg( Exception ):
    def __init__( self, text="error" ):
        self.text = text


# ======================================================================

def sanitizeFilename( filename ):
    fname = re.sub( r'[^A-Za-z0-9\.\-_]', '_', filename )
    fname = re.sub( r'[^A-Za-z0-9\.\-_]', r'_', filename )
    if len(fname) == 0:
        fname = "empty_filename"
    return fname


# ======================================================================

def sanitizeHTML(text, oneline = False):
    tagfinder = re.compile(r"^\<(\S+)\>$")
    ampfinder = re.compile(r"\&([^;\s]*\s)")
    ampendfinder = re.compile(r"\&([^;\s]*)$")
    ltfinder = re.compile(r"<((?!a\s*href)[^>]*\s)")
    ltendfinder = re.compile(r"<([^>]*)$")
    gtfinder = re.compile(r"((?<!\<a)\s[^<]*)>")
    gtstartfinder = re.compile(r"^([<]*)>")

    def tagfilter(text):
        tagfinder = re.compile(r"^\<(\S+)\>$")
        # linkfinder = re.compile(r"^\s*a\s+\"[^\"]+\"\s*")     # I think this didn't work
        linkfinder = re.compile(r"^\s*a\s+href\s*=\s*\"[^\"]+\"\s*((target|style)\s*=\s*\"[^\"]*\"\s*)*")
        imgfinder = re.compile(r"^\s*img\s+((src|style|width|height|alt)\s*=\s*\"[^\"]*\"\s*)*$")
        match = tagfinder.match(text)
        if match is None:
            return None
        contents = match.group(1)
        if linkfinder.match(contents) is not None:
            return text
        if imgfinder.match(contents) is not None:
            return text
        if ( (contents.lower() == "i") or (contents.lower() == "b") or (contents.lower() == "tt") ):
            return text
        elif ( (contents.lower() == "/i") or (contents.lower() == "/b") or
               (contents.lower() == "/tt") or (contents.lower() == "/a") ):
            return text
        elif contents.lower() == "sup":
            return "<span class=\"sup\">"
        elif contents.lower() == "/sup":
            return "</span>"
        elif contents.lower() == "sub":
            return "<span class=\"sub\">"
        elif contents.lower() == "/sub":
            return "</span>"
        else:
            return "&lt;{}&rt;".format(contents)

    # sys.stderr.write("text is \"{}\"\n".format(text.encode('utf-8')))
    newtext = tagfinder.sub(tagfilter, text)
    # sys.stderr.write("after tagfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = ampfinder.sub(r"&amp;\g<1>", newtext, count=0)
    # sys.stderr.write("after ampfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = ampendfinder.sub(r"&amp;\g<1>", newtext, count=0)
    # sys.stderr.write("after ampendfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = ltfinder.sub(r"&lt;\g<1>", newtext, count=0)
    # sys.stderr.write("after ltfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = ltendfinder.sub(r"&lt;\g<1>", newtext, count=0)
    # sys.stderr.write("after ltendfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = gtfinder.sub(r"\g<1>&gt;", newtext, count=0)
    # sys.stderr.write("after gtfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))
    newtext = gtstartfinder.sub(r"\g<1>&gt;", newtext, count=0)
    # sys.stderr.write("after gtendfinder, text is \"{}\"\n".format(newtext.encode('utf-8')))

    if oneline:
        pass   # I hope I don't regret this
    else:
        newtext = re.sub(r"^(?!\s*<p>)", "<p>", newtext, count=0)
        # sys.stderr.write("after beginning <p>, text is \"{}\"\n".format(newtext.encode('utf-8')))
        newtext = re.sub(r"([^\n])$", r"\g<1>\n", newtext, count=0)
        # sys.stderr.write("after ending newline, text is \"{}\"\n".format(newtext.encode('utf-8')))
        newtext = re.sub(r"\s*\n", "</p>\n", newtext, count=0)
        newtext = re.sub(r"</p></p>", "</p>", newtext, count=0)
        # sys.stderr.write("after line-end </p>, text is \"{}\"\n".format(newtext.encode('utf-8')))
        newtext = re.sub(r"\n(?!\s*<p>)([^\n]*</p>)", r"\n<p>\g<1>", newtext, count=0)
        # sys.stderr.write("after line-start <p>, text is \"{}\"\n".format(newtext.encode('utf-8')))
        newtext = re.sub(r"^\s*<p></p>\s*$", "", newtext, count=0)
        # sys.stderr.write("after <p></p>, text is \"{}\"\n".format(newtext.encode('utf-8')))
        newtext = re.sub(r"\n", r"\n\n", newtext, count=0)

    return newtext


# ======================================================================

def intOrZero( val ):
    try:
        return int( val )
    except ValueError:
        return 0


def intOrError( val, description ):
    try:
        return int( val )
    except ValueError:
        raise ErrorMsg( "Error, {} needs to be an integer, got \"{}\"".format( description, val ) )


# ======================================================================

def asUUID( val, canbenone=True ):
    if val is None:
        if canbenone:
            return None
        else:
            return NULLUUID
    if isinstance( val, uuid.UUID ):
        return val
    else:
        return uuid.UUID( val )


NULLUUID = uuid.UUID( '00000000-0000-0000-0000-000000000000' )


# ======================================================================

def asDateTime( string, defaultutc=False ):
    try:
        if string is None:
            return None
        if isinstance( string, datetime.datetime ):
            return string
        dateval = dateutil.parser.parse( string )

        if defaultutc and ( dateval.tzinfo is None ):
            dateval = pytz.utc.localize( dateval )

        return dateval
    except Exception:
        raise ErrorMsg( f'Error, {string} is not a valid date and time.' )
