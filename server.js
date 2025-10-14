const express = require('express');
const axios = require('axios');
const cors = require('cors');

// --- ⚠️ API 키 설정 영역 ---
// 카카오 개발자 사이트에서 발급받은 REST API 키를 입력하세요.
const KAKAO_REST_API_KEY = '1d09a578a80ee97a45b3fd96e637f821';

const app = express();
const port = 3000;

app.use(cors());

// --- 카카오 API 프록시 ---

// [장소 검색 API] 키워드로 장소를 검색합니다.
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ message: '검색어가 필요합니다.' });
        }
        const apiUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("!!! Kakao Search 프록시 에러:", error.response?.data || error.message);
        res.status(500).json({ message: '카카오 장소 검색 API 프록시 실패' });
    }
});

// [길찾기 API] 자동차 또는 도보 길찾기 경로를 요청합니다.
app.get('/api/directions', async (req, res) => {
    try {
        // [수정] priority(경로 옵션) 값을 쿼리에서 받아옵니다.
        const { origin, destination, priority = 'RECOMMEND' } = req.query;
        let apiUrl;

        // 현재 로직에서는 자동차 길찾기만 사용하므로 해당 부분만 수정합니다.
        // [수정] API 주소에 priority 파라미터를 추가합니다.
        apiUrl = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=${priority}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
            }
        });
        res.json(response.data);
       
    } catch (error) {
        console.error("!!! Kakao Directions 프록시 에러:", error.response?.data || error.message);
        res.status(500).json({ message: '카카오 길찾기 API 프록시 실패' });
    }
});

app.listen(port, () => {
    console.log(`프록시 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});