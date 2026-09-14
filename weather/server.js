const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Palvellaan julkisia tiedostoja 'public'-kansiosta
app.use(express.static(path.join(__dirname, 'public')));

// API-päätepiste, joka hakee XML-tiedoston turvallisesti backendin kautta
app.get('/api/weather', async (req, res) => {
    try {
        const response = await fetch('https://weather.willab.fi/weather.xml');
        const xmlData = await response.text();
        res.set('Content-Type', 'text/xml');
        res.send(xmlData);
    } catch (error) {
        res.status(500).send('Virhe sään hakemisessa'); 
    }
});

app.listen(PORT, () => {
    console.log(`Palvelin käynnissä portissa ${PORT}`);
});