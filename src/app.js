const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const fs = require('fs').promises;
const { authenticate } = require('@google-cloud/local-auth');

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'public/views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.render('index.html');
});

app.post('/', async (req, res) => {
    const calendarId = req.body.calendarId;
    const sdate = req.body.sdate;
    const edate = req.body.edate;

    const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
    const TOKEN_PATH = path.join(process.cwd(), 'token.json');
    const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

    async function loadSavedCredentialsIfExist() {
        try {
            const content = await fs.readFile(TOKEN_PATH);
            const credentials = JSON.parse(content);
            return google.auth.fromJSON(credentials);
        } catch (err) {
            return null;
        }
    }

    async function saveCredentials(client) {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
        });
        await fs.writeFile(TOKEN_PATH, payload);
    }

    async function authorize() {
        let client = await loadSavedCredentialsIfExist();
        if (client) {
            return client;
        }
        client = await authenticate({
            scopes: SCOPES,
            keyfilePath: CREDENTIALS_PATH,
        });
        if (client.credentials) {
            await saveCredentials(client);
        }
        return client;
    }

    async function getBusyIntervals(auth) {
        const calendar = google.calendar({ version: 'v3', auth });
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: sdate,
                timeMax: edate,
                timeZone: 'UTC',
                items: [{ id: calendarId }]
            }
        });

        if (!response.data.calendars || !response.data.calendars[calendarId]) {
            throw new Error('Invalid calendar ID or no busy intervals found');
        }

        const busyIntervals = response.data.calendars[calendarId].busy;
        return busyIntervals;
    }

    try {
        const auth = await authorize();
        const busyIntervals = await getBusyIntervals(auth);
        res.render('index.html', { busyIntervals });
    } catch (error) {
        console.error('Error fetching busy intervals:', error);
        res.status(500).send('An error occurred: ' + error.message);
    }
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
