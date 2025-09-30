const express = require('express');
const axios = require('axios');
const cors = require('cors');

// --- ⚠️ API 키 설정 영역 ---
const NAVER_MAP_CLIENT_ID = '2cys7o3zvz';
const NAVER_MAP_CLIENT_SECRET = 'LldeJGCpUGNUuvMsqJrcYbv4cgD845pfhzdFGlFN';
const NAVER_SEARCH_CLIENT_ID = 'Y1heJbdgTBLWFgPweCs9';
const NAVER_SEARCH_CLIENT_SECRET = 'YOUR_SEARCH_CLIENT_SECRET';

const app = express();
const port = 3000;

app.use(cors());

app.get('/api/geocode', async (req, res) => { /* 이전과 동일 */ });
app.get('/api/reverse-geocode', async (req, res) => { /* 이전과 동일 */ });

// 수정된 Directions API 경로
app.get('/api/directions', async (req, res) => {
    try {
        const { start, goal, mode } = req.query;
        let apiUrl;
        if (mode === 'walking') {
            apiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/walking?start=${start}&goal=${goal}`;
        } else {
            apiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving?start=${start}&goal=${goal}&option=trafast`;
        }
        const response = await axios.get(apiUrl, { headers: { 'X-NCP-APIGW-API-KEY-ID': NAVER_MAP_CLIENT_ID, 'X-NCP-APIGW-API-KEY': NAVER_MAP_CLIENT_SECRET } });
        res.json(response.data);
    } catch (error) { console.error("!!! Directions 프록시 에러:", error.response?.data || error.message); res.status(500).json({ message: 'Directions API 프록시 실패' }); }
});

app.get('/api/search', async (req, res) => { /* 이전과 동일 */ });

app.listen(port, () => {
    console.log(`프록시 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});