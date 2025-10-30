const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// [확인용 로그] .env에서 API 키를 제대로 읽었는지 확인
console.log("TMAP API Key Loaded:", process.env.TMAP_API_KEY);
console.log("ORS API Key Loaded:", process.env.ORS_API_KEY);

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname)));

// TMAP 도보 길찾기 API
app.get('/api/directions', async (req, res) => {
    console.log('/api/directions (WALKING) route hit with query:', req.query);
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '출발지, 도착지 정보가 필요합니다.' });
    const [startX, startY] = start.split(',');
    const [endX, endY] = end.split(',');
    try {
        const apiUrl = 'https://apis.openapi.sk.com/tmap/routes/pedestrian';
        const payload = { startX, startY, endX, endY, reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', startName: "출발지", endName: "도착지" };
        const headers = { 'Content-Type': 'application/json', 'appKey': process.env.TMAP_API_KEY };
        const response = await axios.post(apiUrl, payload, { headers });
        console.log('TMAP 도보 경로 API 호출 성공');
        return res.json(response.data);
    } catch (error) {
        console.error('TMAP 도보 경로 API 호출 실패:', error.response?.data || error.message);
        return res.status(500).json({ error: 'TMAP 도보 경로 호출 중 오류가 발생했습니다.' });
    }
});

// ORS 자전거 길찾기 API
app.get('/api/ors-directions', async (req, res) => {
    console.log('/api/ors-directions (BICYCLING) route hit with query:', req.query);
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '출발지, 도착지 정보가 필요합니다.' });
    try {
        const apiUrl = 'https://api.openrouteservice.org/v2/directions/cycling-regular/geojson';
        const payload = { coordinates: [ start.split(',').map(Number), end.split(',').map(Number) ] };
        const headers = { 'Authorization': process.env.ORS_API_KEY, 'Content-Type': 'application/json' };
        const response = await axios.post(apiUrl, payload, { headers });
        console.log('ORS 자전거 경로 API 호출 성공');
        return res.json(response.data);
    } catch (error) {
        console.error('ORS 자전거 경로 API 호출 실패:', error.response?.data || error.message);
        return res.status(500).json({ error: 'ORS 자전거 경로 호출 중 오류가 발생했습니다.' });
    }
});

// [추가] TMAP 자동차 길찾기 API
app.get('/api/tmap-car-directions', async (req, res) => {
    console.log('/api/tmap-car-directions (DRIVING) route hit with query:', req.query);
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '출발지, 도착지 정보가 필요합니다.' });
    const [startX, startY] = start.split(',');
    const [endX, endY] = end.split(',');
    try {
        const apiUrl = 'https://apis.openapi.sk.com/tmap/routes?version=1';
        const payload = { startX, startY, endX, endY, reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO' };
        const headers = { 'Content-Type': 'application/json', 'appKey': process.env.TMAP_API_KEY };
        const response = await axios.post(apiUrl, payload, { headers });
        console.log('TMAP 자동차 경로 API 호출 성공');
        return res.json(response.data);
    } catch (error) {
        console.error('TMAP 자동차 경로 API 호출 실패:', error.response?.data || error.message);
        return res.status(500).json({ error: 'TMAP 자동차 경로 호출 중 오류가 발생했습니다.' });
    }
});

// HTML 페이지 라우팅
app.get('/:page', (req, res) => {
    const page = req.params.page;
    if (page === 'results.html') {
        res.sendFile(path.join(__dirname, 'results.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});