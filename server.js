const express = require('express');
const axios = require('axios');
const cors = require('cors');

// --- ⚠️ API 키 설정 영역 ---
// TMAP API 키를 입력하세요.
const TMAP_APP_KEY = 'YIljWEDBQc3wrrc5uObyqa5LmTUvnpcQ7pVB9lDQ'; // 여기에 발급받은 TMAP 앱 키를 입력하세요.

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json()); // POST 요청의 본문을 파싱하기 위해 추가

// --- TMAP API 프록시 ---

// [장소 검색 API] TMAP 통합 검색 API를 사용합니다.
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ message: '검색어가 필요합니다.' });
        }
        
        const apiUrl = `https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(query)}&count=10`;

        const response = await axios.get(apiUrl, {
            headers: {
                'appKey': TMAP_APP_KEY
            }
        });

        // TMAP API 응답을 클라이언트가 사용하던 형식과 유사하게 변환
        const documents = response.data.searchPoiInfo.pois.poi.map(item => ({
            place_name: item.name,
            road_address_name: item.newAddressList.newAddress[0].fullAddressRoad,
            address_name: item.upperAddrName + ' ' + item.middleAddrName + ' ' + item.lowerAddrName,
            x: item.noorLon,
            y: item.noorLat
        }));

        res.json({ documents });

    } catch (error) {
        console.error("!!! TMAP Search 프록시 에러:", error.response?.data || error.message);
        res.status(500).json({ message: 'TMAP 장소 검색 API 프록시 실패' });
    }
});


// [길찾기 API] 자동차, 도보 길찾기 경로를 요청합니다.
app.post('/api/directions', async (req, res) => {
    try {
        const { startX, startY, endX, endY, mode = 'driving' } = req.body;
        let apiUrl;

        const headers = {
            'appKey': TMAP_APP_KEY,
            'Content-Type': 'application/json'
        };

        const data = {
            startX,
            startY,
            endX,
            endY,
            reqCoordType: "WGS84GEO",
            resCoordType: "WGS84GEO",
            startName: "출발지",
            endName: "도착지"
        };

        if (mode === 'driving') {
            apiUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
        } else if (mode === 'walking') {
            apiUrl = `https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json`;
        } else {
             return res.status(400).json({ message: '자전거 길찾기는 지원되지 않습니다.' });
        }
        
        const response = await axios.post(apiUrl, data, { headers });
        res.json(response.data);
       
    } catch (error) {
        console.error(`!!! TMAP Directions (${req.body.mode || 'driving'}) 프록시 에러:`, error.response?.data || error.message);
        res.status(500).json({ message: 'TMAP 길찾기 API 프록시 실패' });
    }
});


app.listen(port, () => {
    console.log(`프록시 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});