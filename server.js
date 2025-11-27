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
});
console.log('PostgreSQL DB 연결 풀 생성됨');

const app = express();
const port = 3000;

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
        redirectUri: 'http://localhost:3000/api/auth/kakao/callback'
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
        if (req.user && req.user.userId && departureTime && arrivalDateTimeStr) {
            
            const tmapData = response.data;
            const totalTimeSeconds = tmapData.features[0].properties.totalTime;
            
            // TMAP API 호출 시 사용한 출발 시간 (이진 탐색 결과)
            const departureDate = new Date(
                departureTime.substring(0, 4),
                parseInt(departureTime.substring(4, 6)) - 1,
                departureTime.substring(6, 8),
                departureTime.substring(8, 10),
                departureTime.substring(10, 12)
            );

            await pool.query(
                `INSERT INTO searches (user_id, start_address, end_address, mode, desired_arrival_time, calculated_departure_time, route_data_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    req.user.userId,
                    startAddress,
                    endAddress,
                    'DRIVING',
                    new Date(arrivalDateTimeStr), // 희망 도착 시간
                    departureDate,               // 계산된 출발 시간
                    tmapData                     // API 결과 저장
                ]
            );
            // ✅ [로그 추가]
            console.log(`[DB 저장 완료] 알람이 DB에 저장되었습니다. 출발 시간: ${departureDate.toLocaleString()}`);

        } else {
            // ✅ [else 블록 및 로그 추가]
            console.log('[DB 저장 스킵] 로그인이 안되었거나(req.user 없음), 역방향 길찾기가 아니므로(departureTime 없음) DB에 저장하지 않습니다.');
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
            redirect_uri: 'http://localhost:3000/api/auth/kakao/callback',
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

async function sendKakaoTalkNotification(search) {
    console.log(`[알람] 유저(ID: ${search.user_id})에게 카톡 메시지 전송 시도...`);
    console.log(`[알람] DB에서 가져온 Refresh Token: ${search.kakao_refresh_token ? '있음' : '없음!'}`);
    
    let newAccessToken = '';

    try {
        // 1. 저장된 Refresh Token으로 새 Access Token 발급
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
        console.log('[알람] ✅ 카카오 토큰 갱신 성공!'); // [진단 로그 1]
        
    } catch (error) {
        // [진단 로그 2] (가장 중요)
        console.error(`[알람 실패] ❌ 카카오 토큰 갱신 실패 (유저 ID: ${search.user_id}):`, error.response?.data);
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
        return; 
    }

    try {
        // 2. 새로 발급받은 Access Token으로 "나에게 보내기" API 호출
        const messageUrl = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
        
        const textMessage = 
`[출발 알림]
${search.end_address}에 ${new Date(search.desired_arrival_time).toLocaleTimeString('ko-KR')} 도착 예정

지금 출발하셔야 합니다!

- 출발지: ${search.start_address}
- 교통수단: ${search.mode}`;

        const messagePayload = {
                object_type: 'text',
                text: textMessage,
                link: {
                    web_url: `http://localhost:3000/results.html?start=${encodeURIComponent(search.start_address)}&end=${encodeURIComponent(search.end_address)}&mode=${search.mode}&date=${new Date(search.desired_arrival_time).toISOString().split('T')[0]}&time=${new Date(search.desired_arrival_time).toTimeString().substring(0,5)}`,
                    mobile_web_url: `http://localhost:3000/results.html?start=${encodeURIComponent(search.start_address)}&end=${encodeURIComponent(search.end_address)}&mode=${search.mode}&date=${new Date(search.desired_arrival_time).toISOString().split('T')[0]}&time=${new Date(search.desired_arrival_time).toTimeString().substring(0,5)}`
                }
        };

        await axios.post(messageUrl, new URLSearchParams({ template_object: JSON.stringify(messagePayload) }).toString(), {
            headers: { 
                'Authorization': `Bearer ${newAccessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // 3. 알람 발송 성공
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
        console.log(`[알람 성공] ✅ 유저(ID: ${search.user_id})에게 카톡 메시지 전송 완료!`); // [진단 로그 3]

    } catch (error) {
        // [진단 로그 4]
        console.error(`[알람 실패] ❌ 카톡 메시지 전송 실패 (유저 ID: ${search.user_id}):`, error.response?.data || error.message);
        await pool.query('UPDATE searches SET notification_sent = true WHERE id = $1', [search.id]);
    }
}

// 매 분마다 실행되는 스케줄러
cron.schedule('* * * * *', async () => {
    console.log('[CRON] 알람 보낼 내역 확인 중...');
    
    try {
        // 현재 시간 1분 이내에 출발해야 하고 아직 알람이 안 간 내역 조회
        const res = await pool.query(
            `SELECT s.*, u.kakao_id, u.kakao_refresh_token
             FROM searches s
             JOIN users u ON s.user_id = u.id
             WHERE s.calculated_departure_time <= NOW()
               AND s.calculated_departure_time >= NOW() - INTERVAL '5 minute' -- 5분 지연까지 허용
               AND s.notification_sent = false`
        );

        if (res.rows.length > 0) {
            console.log(`[CRON] ${res.rows.length}개의 알람 발송 시작...`);
            for (const search of res.rows) {
                // 5단계: 카카오톡 메시지 전송 로직
                await sendKakaoTalkNotification(search); 
            }
        }

    } catch (error) {
        console.error('[CRON] 스케줄러 작업 실패:', error);
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});