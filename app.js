const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const qrcode = require('qrcode');
const express = require('express');
const socket = require('socket.io')
const logger = require('node-logger');
const multer = require('multer')
const { WebView } = require('webview-node')
const { WifiPlus } = require('node-wifi-plus');

// custom modules
const generator = require('./modules/generator')