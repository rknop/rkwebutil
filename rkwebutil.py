class ErrorMsg( Exception ):
    def __init__( self, text="error" ):
        self.text = text

