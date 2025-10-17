const express = require('express');
const axios = require('axios');
const cors = require('cors');

// --- ⚠️ API 키 설정 영역 ---
const TMAP_APP_KEY = 'YIljWEDBQc3wrrc5uObyqa5LmTUvnpcQ7pVB9lDQ'; // 여기에 발급받은 TMAP 앱 키를 입력하세요.

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// --- TMAP API 프록시 ---

// [장소 검색 API]
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ message: '검색어가 필요합니다.' });
        }
        const apiUrl = `https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(query)}&count=10`;
        const response = await axios.get(apiUrl, { headers: { 'appKey': TMAP_APP_KEY } });

        // --- ⭐️ 수정된 부분 시작 ---
        // TMAP API 응답에서 searchPoiInfo나 pois 객체가 없는 경우(검색 결과가 없는 경우)를 확인합니다.
        if (response.data.searchPoiInfo && response.data.searchPoiInfo.pois) {
            const documents = response.data.searchPoiInfo.pois.poi.map(item => ({
                place_name: item.name,
                road_address_name: item.newAddressList.newAddress[0].fullAddressRoad,
                address_name: `${item.upperAddrName} ${item.middleAddrName} ${item.lowerAddrName}`,
                x: item.noorLon,
                y: item.noorLat
            }));
            res.json({ documents });
        } else {
            // 검색 결과가 없으면 빈 배열을 클라이언트에 보냅니다.
            res.json({ documents: [] });
        }
        // --- ⭐️ 수정된 부분 끝 ---

    } catch (error) {
        console.error("!!! TMAP Search 프록시 에러:", error.response?.data || error.message);
        res.status(500).json({ message: 'TMAP 장소 검색 API 프록시 실패' });
    }
});

// [길찾기 API] 자동차, 도보, 대중교통
app.post('/api/directions', async (req, res) => {
    try {
        const { startX, startY, endX, endY, mode = 'driving' } = req.body;
        let apiUrl;
        const headers = { 'appKey': TMAP_APP_KEY, 'Content-Type': 'application/json' };
        let data;

        if (mode === 'driving') {
            apiUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
            data = { startX, startY, endX, endY, reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" };
        } else if (mode === 'walking') {
            apiUrl = `https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json`;
            data = { startX, startY, endX, endY, reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", startName: "출발지", endName: "도착지" };
        } else if (mode === 'transit') {
            apiUrl = `https://apis.openapi.sk.com/transit/routes`;
            data = { startX, startY, endX, endY }; // 대중교통은 필요한 파라미터만 전송
        } else {
            return res.status(400).json({ message: '지원되지 않는 길찾기 모드입니다.' });
        }
        
        const response = await axios.post(apiUrl, data, { headers });
        res.json(response.data);
    } catch (error) {
        console.error(`!!! TMAP Directions (${req.body.mode}) 프록시 에러:`, error.response?.data || error.message);
        res.status(500).json({ message: 'TMAP 길찾기 API 프록시 실패' });
    }
});

app.listen(port, () => {
    console.log(`프록시 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});