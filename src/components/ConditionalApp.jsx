import React from 'react';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import BrowserModalComponent from './browser-modal/browser-modal.jsx';
import supportedBrowser from '../lib/supported-browser.js';
import styles from '../playground/index.css';
//import BrowserModalComponent from '../components/browser-modal/browser-modal.jsx';

 // Assuming this function retrieves space name from URL
const appTarget = document.createElement('div');
appTarget.className = styles.app;
document.body.appendChild(appTarget);
BrowserModalComponent.setAppElement(appTarget);

const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true /* localesOnly */);


const handleBack = () => {};

const ConditionalApp = () => (
  <>
    {supportedBrowser() ? (
      // require needed here to avoid importing unsupported browser-crashing code
      require('../playground/render-gui.jsx').default(appTarget)
    ) : (
      
      <WrappedBrowserModalComponent onBack={handleBack} />
    )}
  </>
);

export default ConditionalApp;
