# 芬園垃圾車 LINE 通知 PWA

專門監測彰化縣芬園鄉進芬村大彰路四段578巷6號附近的垃圾車與清運點。

## 安裝

```sh
npm install
cp .env.example .env
npm start
```

在 `.env` 設定 LINE Channel access token 與 channel secret。

## LINE Webhook

部署後，Webhook URL 設為：

```text
https://你的網域/line/webhook
```

雲端伺服器每 30 秒輪詢一次樂圾通；垃圾車進入 300 公尺範圍時，推播給已加好友的 LINE 帳號。
