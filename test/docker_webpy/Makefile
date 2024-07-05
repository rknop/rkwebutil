INSTALLDIR = ../test_install/webpy

INSTALL_HERE = ap.css ap.js ap.py ap_start.js
INSTALL_PARENT = rkauth_webpy.py config.py resetpasswd_start.js rkauth.js rkwebutil.js

install : $(patsubst %, $(INSTALLDIR)/%, $(INSTALL_HERE) $(INSTALL_PARENT))

$(patsubst %, $(INSTALLDIR)/%, $(INSTALL_HERE)): $(INSTALLDIR)/% : % | $(INSTALLDIR)
	cp -p $< $@

$(patsubst %, $(INSTALLDIR)/%, $(INSTALL_PARENT)): $(INSTALLDIR)/% : ../../% | $(INSTALLDIR)
	cp -p $< $@

$(INSTALLDIR):
	mkdir -p $(INSTALLDIR)

clean:
	rm -vf $(INSTALLDIR)/*
