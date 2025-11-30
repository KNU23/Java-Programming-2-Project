process.env.TZ = 'Asia/Seoul';
const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// [확인용 로그] .env에서 API 키를 제대로 읽었는지 확인
console.log("TMAP API Key Loaded:", process.env.TMAP_API_KEY);
console.log("ORS API Key Loaded:", process.env.ORS_API_KEY);
console.log("Kakao REST API Key Loaded:", process.env.KAKAO_REST_API_KEY);

const { Pool } = require('pg');
const pool = new Pool({
    // .env 파일에 DB 접속 정보를 추가하세요 (DB_USER, DB_HOST, DB_DATABASE, DB_PASSWORD, DB_PORT)
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,

    ssl: {
        rejectUnauthorized: false 
    }
});
console.log('PostgreSQL DB 연결 풀 생성됨');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// [기존] 브라우저에서 보낸 JSON 본문(req.body)을 파싱하기 위해 필요합니다.
app.use(express.json()); 

app.use(cookieParser()); // 쿠키 파서 미들웨어 등록

const cron = require('node-cron');

// JWT 인증 미들웨어 (진단 로그 추가)
const authenticateToken = (req, res, next) => {
    // [진단 로그 1] 이 API 요청에 미들웨어가 실행되었는지 확인
    console.log(`[Auth Check] API: ${req.originalUrl}`);

    const token = req.cookies.token;
    if (!token) {
        // [진단 로그 2] 토큰이 없는지 확인
        console.log('[Auth Check] 토큰 쿠키(req.cookies.token)를 찾을 수 없습니다.');
        return next();
    }

    console.log('[Auth Check] 토큰 쿠키를 찾았습니다. 검증을 시도합니다.');

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            // [진단 로그 3] 토큰 검증 실패 확인 (예: 만료, 시크릿 키 불일치)
            console.log('[Auth Check] JWT 검증 실패:', err.message);
            return next();
        }
        
        // 토큰이 유효하면, req 객체에 user 정보를 추가
        req.user = user;
        console.log(`[Auth Check] 인증 성공! 유저 ID: ${req.user.userId}를 req.user에 할당합니다.`);
        next();
    });
};

// [수정] 브라우저(results.js)의 로그를 받아 터미널에 출력하는 엔드포인트
app.post('/api/log', (req, res) => {
    const { message } = req.body;
    
    // [수정] if (message) -> if (req.body.hasOwnProperty('message'))
    // 이렇게 해야 빈 문자열("")도 로그로 찍을 수 있습니다.
    if (req.body.hasOwnProperty('message')) {
        // 💡 브라우저로부터 받은 메시지를 터미널에 [CLIENT LOG]와 함께 출력합니다.
        console.log(`[CLIENT LOG] ${message}`); 
    }
    res.sendStatus(200); // "로그 잘 받았다"고 응답
});

// 프론트엔드에 카카오 REST API 키와 Redirect URI를 전달하는 엔드포인트
app.get('/api/auth/kakao/config', (req, res) => {
    res.json({
        restApiKey: process.env.KAKAO_REST_API_KEY,
        redirectUri: 'https://javamap.azurewebsites.net/api/auth/kakao/callback'
    });
});

// TMAP 도보 길찾기 API (기존 코드와 동일)
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

// ORS 자전거 길찾기 API (기존 코드와 동일)
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

// TMAP 자동차 길찾기 API (기존 코드와 동일)
app.get('/api/tmap-car-directions', authenticateToken, async (req, res) => {
    console.log('/api/tmap-car-directions (DRIVING) route hit with query:', req.query);
    
    const { start, end, departureTime, startAddress, endAddress, arrivalDateTimeStr } = req.query;
    
    if (!start || !end) return res.status(400).json({ error: '출발지, 도착지 정보가 필요합니다.' });
    
    const [startX, startY] = start.split(',');
    const [endX, endY] = end.split(',');
    
    try {
        const apiUrl = 'https://apis.openapi.sk.com/tmap/routes?version=1';
        
        const payload = { 
            startX, 
            startY, 
            endX, 
            endY, 
            reqCoordType: 'WGS84GEO', 
            resCoordType: 'WGS84GEO' 
        };

        if (departureTime) {
            payload.departureTime = departureTime;
            console.log('Using departureTime:', departureTime);
        }

        const headers = { 'Content-Type': 'application/json', 'appKey': process.env.TMAP_API_KEY };
        
        const response = await axios.post(apiUrl, payload, { headers });

        // 3. API 응답 성공 후, 로그인한 사용자이고 '역방향 찾기'라면 DB에 저장
if (req.user && req.user.userId && departureTime && arrivalDateTimeStr && req.query.save !== 'false') {
            
            const tmapData = response.data;
            const totalTimeSeconds = tmapData.features[0].properties.totalTime;
            
            // 계산된 출발 시간
            const departureDate = new Date(
                departureTime.substring(0, 4),
                parseInt(departureTime.substring(4, 6)) - 1,
                departureTime.substring(6, 8),
                departureTime.substring(8, 10),
                departureTime.substring(10, 12)
            );

            // [추가된 로직] 현재 시간보다 미래일 때만 저장 (이미 지난 시간은 알람 X)
            if (departureDate > new Date()) {
                await pool.query(
                    `INSERT INTO searches (user_id, start_address, end_address, mode, desired_arrival_time, calculated_departure_time, route_data_json)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        req.user.userId,
                        startAddress,
                        endAddress,
                        'DRIVING',
                        new Date(arrivalDateTimeStr),
                        departureDate,
                        tmapData
                    ]
                );
                console.log(`[DB 저장 완료] 알람 저장됨. 출발 시간: ${departureDate.toLocaleString()}`);
            } else {
                console.log(`[DB 저장 스킵] 계산된 출발 시간(${departureDate.toLocaleString()})이 이미 지났습니다.`);
            }

        } else {
            // save=false 이거나 로그인이 안 된 경우
            // console.log('[DB 저장 스킵] 계산 전용 요청이거나 조건 미달입니다.');
        }
        
        console.log('TMAP 자동차 경로 API 호출 성공');
        return res.json(response.data);

    } catch (error) {
        console.error('TMAP 자동차 경로 API 호출 실패:', error.response?.data || error.message);
        return res.status(500).json({ error: 'TMAP 자동차 경로 호출 중 오류가 발생했습니다.' });
    }
});

// 카카오 로그인 콜백(Redirect URI) 처리
app.get('/api/auth/kakao/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('카카오 로그인에 실패했습니다. (인가 코드 없음)');
    }

    try {
        // 1. 인가 코드로 카카오에 토큰(Access Token, Refresh Token)을 요청
        const tokenUrl = 'https://kauth.kakao.com/oauth/token';
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.KAKAO_REST_API_KEY,
            redirect_uri: 'https://javamap.azurewebsites.net/api/auth/kakao/callback',
            code: code,
        });

        const tokenRes = await axios.post(tokenUrl, tokenParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token } = tokenRes.data;

        // 2. 받은 Access Token으로 사용자 정보 요청
        const userUrl = 'https://kapi.kakao.com/v2/user/me';
        const userRes = await axios.get(userUrl, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        const kakaoUser = userRes.data;
        const kakaoId = kakaoUser.id;
        const nickname = kakaoUser.properties.nickname;

        console.log(`[로그인 성공] 카카오ID: ${kakaoId}, 닉네임: ${nickname}`);

        // 3. DB에 사용자 정보 저장 (INSERT or UPDATE)
        const dbRes = await pool.query(
            `INSERT INTO users (kakao_id, nickname, kakao_access_token, kakao_refresh_token)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (kakao_id) 
             DO UPDATE SET 
                nickname = $2, 
                kakao_access_token = $3, 
                kakao_refresh_token = $4
             RETURNING id`, // DB에서 생성된(또는 기존) user id 반환
            [kakaoId, nickname, access_token, refresh_token]
        );

        const userId = dbRes.rows[0].id; // 우리 DB의 User ID
        console.log(`DB 저장/업데이트 완료. 유저 ID: ${userId}`);

        // 4. 로그인 처리를 위한 JWT 발급
        const token = jwt.sign(
            { userId: userId }, // 우리 DB의 user id를 payload에 담음
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // 7일간 유효
        );

        // 5. JWT를 httpOnly 쿠키에 담아 리디렉션
        res.cookie('token', token, {
            httpOnly: true, // 자바스크립트에서 접근 불가
            secure: false, // 로컬 테스트용 (배포 시 true)
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
        });
        res.redirect('/index.html');

    } catch (error) {
        console.error('카카오 콜백 처리 실패:', error.response?.data || error.message);
        res.status(500).send('카카오 인증 처리 중 오류 발생');
    }
});

// ✅ 1. 로그인 상태 확인 API (닉네임 반환)
// (authenticateToken 미들웨어는 이 코드보다 위에 정의되어 있어야 합니다)
app.get('/api/auth/status', authenticateToken, async (req, res) => {
    if (req.user && req.user.userId) {
        // 사용자가 로그인됨 -> DB에서 닉네임 조회
        try {
            const result = await pool.query(
                'SELECT nickname FROM users WHERE id = $1',
                [req.user.userId]
            );
            
            if (result.rows.length > 0) {
                res.json({ loggedIn: true, nickname: result.rows[0].nickname });
            } else {
                // 토큰은 있는데 DB에 유저가 없는 비정상적 경우
                res.clearCookie('token');
                res.json({ loggedIn: false });
            }
        } catch (error) {
            console.error('DB 닉네임 조회 실패:', error);
            res.status(500).json({ loggedIn: false });
        }
    } else {
        // 사용자가 로그인 안됨
        res.json({ loggedIn: false });
    }
});

// ✅ 2. 로그아웃 API
app.get('/api/auth/logout', (req, res) => {
    // JWT가 저장된 'token' 쿠키를 삭제
    res.clearCookie('token', { httpOnly: true, secure: false }); // httpOnly, secure 옵션은 쿠키 생성 시와 동일하게
    // 로그아웃 후 메인 페이지로 리디렉션
    res.redirect('/index.html');
});

// HTML 페이지 라우팅 (기존 코드와 동일)
app.get('/:page', (req, res) => {
    const page = req.params.page;
    if (page === 'results.html') {
        res.sendFile(path.join(__dirname, 'results.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// ✅ 1. 카카오톡 알림 전송 함수 (최적화됨)
async function sendKakaoTalkNotification(search) {
    console.log(`[알람 시작] 유저(ID: ${search.user_id})에게 출발 알림 전송 시도`);

    let newAccessToken = '';

    // 1️⃣ 토큰 갱신 시도
    try {
        const tokenUrl = 'https://kauth.kakao.com/oauth/token';
        const tokenParams = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: process.env.KAKAO_REST_API_KEY,
            refresh_token: search.kakao_refresh_token,
        });

        const tokenRes = await axios.post(tokenUrl, tokenParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        newAccessToken = tokenRes.data.access_token;
        // 갱신된 리프레시 토큰이 있다면 DB 업데이트 (선택 사항)
    } catch (error) {
        console.error(`[알람 실패] ❌ 토큰 갱신 실패 (유저 ID: ${search.user_id}) - 알람 처리 완료로 간주`);
        // 토큰이 만료되어 보낼 수 없으므로, 계속 재시도하지 않게 true로 처리
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
        return; 
    }

    // 2️⃣ 메시지 전송
    try {
        const messageUrl = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
        
        // 도착 예정 시간 포맷팅 (예: 14:30)
        const arrivalTimeObj = new Date(search.desired_arrival_time);
        const arrivalTimeStr = `${arrivalTimeObj.getHours()}시 ${arrivalTimeObj.getMinutes()}분`;

        const textMessage = 
`[🚗 출발 알림]
약속 시간인 ${arrivalTimeStr}에 도착하려면 지금 출발해야 합니다!

- 목적지: ${search.end_address}
- 예상 소요시간: 약 ${Math.round(search.route_data_json.features[0].properties.totalTime / 60)}분`;

        const messagePayload = {
            object_type: 'text',
            text: textMessage,
            link: {
                // 모바일에서 클릭 시 바로 길안내 결과 페이지로 이동
                web_url: `https://javamap.azurewebsites.net/results.html?start=${encodeURIComponent(search.start_address)}&end=${encodeURIComponent(search.end_address)}&mode=DRIVING&date=${arrivalTimeObj.toISOString().split('T')[0]}&time=${arrivalTimeObj.toTimeString().substring(0,5)}`,
                mobile_web_url: `https://javamap.azurewebsites.net/results.html?start=${encodeURIComponent(search.start_address)}&end=${encodeURIComponent(search.end_address)}&mode=DRIVING&date=${arrivalTimeObj.toISOString().split('T')[0]}&time=${arrivalTimeObj.toTimeString().substring(0,5)}`
            },
            button_title: "경로 확인하기"
        };

        await axios.post(messageUrl, new URLSearchParams({ template_object: JSON.stringify(messagePayload) }).toString(), {
            headers: { 
                'Authorization': `Bearer ${newAccessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // 3️⃣ 성공 처리 (가장 중요: 알람 보냈음을 DB에 기록)
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
        console.log(`[알람 성공] ✅ 메시지 전송 완료 (ID: ${search.id})`);

    } catch (error) {
        console.error(`[알람 실패] ❌ 메시지 전송 중 에러:`, error.response?.data || error.message);
        // 에러가 나도 재발송 방지를 위해 true로 할지, 재시도할지 결정. 
        // 여기서는 무한 루프 방지를 위해 true로 처리합니다.
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
    }
}

// ✅ 2. 스케줄러 (매 분 실행)
cron.schedule('* * * * *', async () => {
    // console.log('[CRON] 출발 시간 체크 중...'); 
    
    try {
        // "현재 시간(NOW)이 출발 시간(calculated_departure_time)을 지났고,
        // 아직 알람을 보내지 않았으며(false),
        // 출발 시간이 지난 지 10분 이내인 건"을 조회 (너무 오래된 건 무시)
        const res = await pool.query(
            `SELECT s.*, u.kakao_id, u.kakao_refresh_token
             FROM searches s
             JOIN users u ON s.user_id = u.id
             WHERE s.calculated_departure_time <= NOW()
               AND s.calculated_departure_time >= NOW() - INTERVAL '10 minute'
               AND s.notification_sent = false`
        );

        if (res.rows.length > 0) {
            console.log(`[CRON] 🔔 알람 대상 ${res.rows.length}건 발견! 전송 시작...`);
            for (const search of res.rows) {
                // 비동기로 보내되, 순차 처리를 위해 await 사용
                await sendKakaoTalkNotification(search); 
            }
        }

    } catch (error) {
        console.error('[CRON] 스케줄러 에러:', error);
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
    // [함수] TMAP API를 사용하여 주소 -> 좌표(WGS84) 변환
async function getCoordinates(address) {
    try {
        const response = await axios.get(`https://apis.openapi.sk.com/tmap/geo/fullAddrGeo`, {
            params: {
                version: 1,
                format: 'json',
                appKey: process.env.TMAP_API_KEY, // .env 파일의 TMAP_API_KEY 사용
                coordType: 'WGS84GEO',
                fullAddr: address
            }
        });

        const info = response.data.coordinateInfo;
        if (!info || !info.coordinate || info.coordinate.length === 0) {
            throw new Error('좌표 변환 실패');
        }

        // TMAP 응답에서 위도/경도 추출
        const lat = info.coordinate[0].newLat || info.coordinate[0].lat;
        const lon = info.coordinate[0].newLon || info.coordinate[0].lon;

        return { lat, lng: lon };
    } catch (error) {
        console.error(`[좌표변환 에러] ${address}:`, error.message);
        throw error;
    }
}

// [API] 주소 기반 길찾기 (앱에서 이 주소로 요청을 보냅니다)   // 수정됨
    // [API] 주소 기반 길찾기 & 소요시간 계산 (모드별 API 분기 처리)
    app.post('/api/route/by-address', async (req, res) => {
        const { startAddress, endAddress, mode } = req.body;
        console.log(`[길찾기 요청] ${startAddress} -> ${endAddress} (모드: ${mode})`);

        try {
            // 1. 좌표 변환 (TMAP Geocoding 공통 사용)
            const [startCoord, endCoord] = await Promise.all([
                getCoordinates(startAddress),
                getCoordinates(endAddress)
            ]);

            let durationSeconds = 0; // 소요 시간(초)
            let routeData = null;    // 경로 데이터

            // 2. 이동 수단별 API 호출 분기
            if (mode === 'TRANSIT') {
                // 🚌 대중교통: Google Maps Directions API
                const googleKey = process.env.GOOGLE_MAPS_API_KEY;
                const url = `https://maps.googleapis.com/maps/api/directions/json`;

                const response = await axios.get(url, {
                    params: {
                        origin: `${startCoord.lat},${startCoord.lng}`,
                        destination: `${endCoord.lat},${endCoord.lng}`,
                        mode: 'transit',
                        language: 'ko',
                        key: googleKey
                    }
                });

                if (response.data.status === 'OK') {
                    durationSeconds = response.data.routes[0].legs[0].duration.value;
                    routeData = response.data;
                } else {
                    throw new Error(`구글 길찾기 실패: ${response.data.status}`);
                }

            } else if (mode === 'BICYCLING') {
                // 🚲 자전거: OpenRouteService (ORS) API
                const orsKey = process.env.ORS_API_KEY;
                // ORS는 '경도,위도' 순서임에 주의!
                const url = `https://api.openrouteservice.org/v2/directions/cycling-regular?api_key=${orsKey}&start=${startCoord.lng},${startCoord.lat}&end=${endCoord.lng},${endCoord.lat}`;

                const response = await axios.get(url);

                if (response.data.features && response.data.features.length > 0) {
                    durationSeconds = response.data.features[0].properties.segments[0].duration;
                    routeData = response.data;
                } else {
                    throw new Error('ORS 자전거 길찾기 실패');
                }

            } else if (mode === 'WALKING') {
                // 🚶 도보: TMAP 보행자 API
                const response = await axios.post(
                    'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json',
                    {
                        startX: parseFloat(startCoord.lng),
                        startY: parseFloat(startCoord.lat),
                        endX: parseFloat(endCoord.lng),
                        endY: parseFloat(endCoord.lat),
                        reqCoordType: "WGS84GEO",
                        resCoordType: "WGS84GEO",
                        startName: "Start",
                        endName: "End"
                    },
                    { headers: { appKey: process.env.TMAP_API_KEY } }
                );
                durationSeconds = response.data.features[0].properties.totalTime;
                routeData = response.data;

            } else {
                // 🚗 운전 (기본값): TMAP 자동차 API
                const response = await axios.post(
                    'https://apis.openapi.sk.com/tmap/routes?version=1&format=json',
                    {
                        startX: parseFloat(startCoord.lng),
                        startY: parseFloat(startCoord.lat),
                        endX: parseFloat(endCoord.lng),
                        endY: parseFloat(endCoord.lat),
                        reqCoordType: "WGS84GEO",
                        resCoordType: "WGS84GEO",
                        totalValue: 2
                    },
                    { headers: { appKey: process.env.TMAP_API_KEY } }
                );
                durationSeconds = response.data.features[0].properties.totalTime;
                routeData = response.data;
            }

            console.log(`[계산 완료] 소요시간: ${Math.round(durationSeconds / 60)}분`);

            res.json({
                success: true,
                duration: durationSeconds, // 앱에서 출발시간 계산용
                data: routeData,
                coords: { start: startCoord, end: endCoord }
            });

        } catch (error) {
            console.error('[서버 길찾기 실패]', error.message);
            // 에러 상세 정보 출력 (디버깅용)
            if (error.response) console.error(error.response.data);

            res.status(500).json({ success: false, message: '길찾기 실패', error: error.message });
        }
    });
    // [함수] TMAP API를 사용하여 주소 -> 좌표(WGS84) 변환 // 수정됨
    async function getCoordinates(address) {
        try {
            const response = await axios.get(`https://apis.openapi.sk.com/tmap/geo/fullAddrGeo`, {
                params: {
                    version: 1,
                    format: 'json',
                    appKey: process.env.TMAP_API_KEY, // .env 파일의 TMAP_API_KEY 사용
                    coordType: 'WGS84GEO',
                    fullAddr: address
                }
            });

            const info = response.data.coordinateInfo;
            if (!info || !info.coordinate || info.coordinate.length === 0) {
                throw new Error('좌표 변환 실패');
            }

            // TMAP 응답에서 위도/경도 추출
            const lat = info.coordinate[0].newLat || info.coordinate[0].lat;
            const lon = info.coordinate[0].newLon || info.coordinate[0].lon;

            return { lat, lng: lon };
        } catch (error) {
            console.error(`[좌표변환 에러] ${address}:`, error.message);
            throw error;
        }
    }

    // [API] 주소 기반 길찾기 (앱에서 이 주소로 요청을 보냅니다)  // 수정됨
    app.post('/api/route/by-address', async (req, res) => {
        const { startAddress, endAddress } = req.body;
        console.log(`[길찾기 요청] ${startAddress} -> ${endAddress}`);

        try {
            // 1. 출발지 & 목적지 주소를 좌표로 변환 (병렬 처리)
            const [startCoord, endCoord] = await Promise.all([
                getCoordinates(startAddress),
                getCoordinates(endAddress)
            ]);

            console.log(`[좌표 변환 완료] 출발: ${startCoord.lat},${startCoord.lng} / 도착: ${endCoord.lat},${endCoord.lng}`);

            // 2. 변환된 좌표로 TMAP 보행자 경로 안내 요청
            const tmapRes = await axios.post(
                'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json',
                {
                    startX: parseFloat(startCoord.lng),
                    startY: parseFloat(startCoord.lat),
                    endX: parseFloat(endCoord.lng),
                    endY: parseFloat(endCoord.lat),
                    reqCoordType: "WGS84GEO",
                    resCoordType: "WGS84GEO",
                    startName: "출발지",
                    endName: "목적지"
                },
                { headers: { appKey: process.env.TMAP_API_KEY } }
            );

            // 3. 앱에게 결과 반환 (경로 데이터 + 변환된 좌표)
            res.json({
                success: true,
                data: tmapRes.data,
                coords: { start: startCoord, end: endCoord }
            });

        } catch (error) {
            console.error('[서버 에러]', error.message);
            res.status(500).json({ success: false, message: '길찾기 실패', error: error.message });
        }
    });
    //  구글 장소 검색 프록시 (앱 -> 내 서버 -> 구글 API)  // 수정됨
    app.get('/api/search/address', async (req, res) => {
        const { keyword } = req.query;
        console.log(`[1. 요청수신] 검색어: ${keyword}`);

        try {
            const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

            // 키가 제대로 로드되었는지 확인
            if (!GOOGLE_KEY) {
                console.error("[오류] .env 파일에 GOOGLE_MAPS_API_KEY가 없습니다!");
                return res.status(500).json({ error: 'API 키 누락' });
            }

            console.log(`[2. 구글호출] 키(앞5자리): ${GOOGLE_KEY.substring(0, 5)}...`);

            const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
                params: {
                    input: keyword,
                    key: GOOGLE_KEY,
                    language: 'ko',
                    components: 'country:kr'
                }
            });

            // 구글 응답 전체 로그 출력 (에러 원인 파악용)
            console.log(`[3. 구글응답] 상태: ${response.data.status}`);

            if (response.data.status !== 'OK') {
                console.log(`[구글 에러 메시지] ${response.data.error_message}`);
            }

            res.json(response.data);

        } catch (error) {
            console.error('[서버 내부 에러]', error.message);
            // 에러 상세 내용 출력
            if (error.response) {
                console.error('응답 데이터:', error.response.data);
            }
            res.status(500).json({ error: '서버 에러 발생' });
        }
    });
});


