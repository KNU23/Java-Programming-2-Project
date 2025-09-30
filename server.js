const express = require('express');
const axios = require('axios');
const cors = require('cors');

// --- ⚠️ API 키 설정 영역 ---

// 기존에 사용하던 지도 API 키 (네이버 클라우드 플랫폼)
const NAVER_MAP_CLIENT_ID = '2cys7o3zvz';       // 기존 지도 Client ID
const NAVER_MAP_CLIENT_SECRET = 'LldeJGCpUGNUuvMsqJrcYbv4cgD845pfhzdFGlFN'; // 기존 지도 Client Secret

// 새로 받은 검색 API 키 (네이버 개발자 센터)
const NAVER_SEARCH_CLIENT_ID = 'Y1heJbdgTBLWFgPweCs9';       // 새로 받은 검색 Client ID
const NAVER_SEARCH_CLIENT_SECRET = 'z_SPDU1_JX'; // 새로 받은 검색 Client Secret

const app = express();
const port = 3000;

app.use(cors());

// --- 지도 관련 API 프록시 ---
app.get('/api/geocode', async (req, res) => {
    try {
        const query = req.query.query;
        const apiUrl = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': NAVER_MAP_CLIENT_ID, // 지도 키 사용
                'X-NCP-APIGW-API-KEY': NAVER_MAP_CLIENT_SECRET
            }
        });
        res.json(response.data);
    } catch (error) { console.error("!!! Geocode 프록시 에러:", error.response?.data || error.message); res.status(500).json({ message: 'Geocoding API 프록시 실패' }); }
});

app.get('/api/reverse-geocode', async (req, res) => {
    try {
        const coords = req.query.coords;
        const apiUrl = `https://openapi.naver.com/v1/map-reversegeocode/v2/gc?coords=${coords}&output=json`;
        const response = await axios.get(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': NAVER_MAP_CLIENT_ID, // 지도 키 사용
                'X-NCP-APIGW-API-KEY': NAVER_MAP_CLIENT_SECRET
            }
        });
        res.json(response.data);
    } catch (error) { console.error("!!! Reverse Geocode 프록시 에러:", error.response?.data || error.message); res.status(500).json({ message: 'Reverse Geocoding API 프록시 실패' }); }
});

app.get('/api/directions', async (req, res) => {
    try {
        const { start, goal, mode } = req.query;
        let apiUrl;
        if (mode === 'walking') {
            apiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/walking?start=${start}&goal=${goal}`;
        } else {
            apiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=trafast`;
        }
        const response = await axios.get(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': NAVER_MAP_CLIENT_ID, // 지도 키 사용
                'X-NCP-APIGW-API-KEY': NAVER_MAP_CLIENT_SECRET
            }
        });
        res.json(response.data);
    } catch (error) { console.error("!!! Directions 프록시 에러:", error.response?.data || error.message); res.status(500).json({ message: 'Directions API 프록시 실패' }); }
});

// --- 검색 관련 API 프록시 ---
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) { return res.status(400).json({ message: '검색어가 필요합니다.' }); }
        const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`;
        const response = await axios.get(apiUrl, {
            headers: {
                'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,     // ⚠️ 검색 키와 다른 헤더 이름 사용
                'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET
            }
        });
        res.json(response.data);
    } catch (error) { console.error("!!! Search 프록시 에러:", error.response?.data || error.message); res.status(500).json({ message: 'Search API 프록시 실패' }); }
});

app.listen(port, () => {
    console.log(`프록시 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});