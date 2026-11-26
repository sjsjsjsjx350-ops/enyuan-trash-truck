const RANGE = 300;
let lastVehicleSignature = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const radians = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setStatus(kind, title, detail) {
  const card = document.getElementById('statusCard');
  card.className = `status-card ${kind || ''}`.trim();
  document.getElementById('statusTitle').textContent = title;
  document.getElementById('statusDetail').textContent = detail;
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    new Notification(title, { body, icon: './icon.svg', tag: 'trash-monitor' });
  }
}

async function refresh() {
  document.getElementById('refreshButton').disabled = true;
  try {
    const response = await fetch('./api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const nearby = data.nearby || [];

    const vehicleList = document.getElementById('vehicleList');
    vehicleList.innerHTML = nearby.length
      ? nearby.map(car => `<article class="vehicle"><div><strong>${escapeHtml(car.Car_Number)}</strong><span>${escapeHtml(car.Car_Style)} · ${escapeHtml(car.Log_DTime)}</span></div><span class="distance">${Math.round(car.distance)} m</span></article>`).join('')
      : '<p class="empty">目前範圍內沒有回報車輛</p>';

    const points = data.points || [];
    const pointList = document.getElementById('pointList');
    pointList.innerHTML = points.length
      ? points.slice(0, 6).map(point => `<article class="point"><div><strong>${escapeHtml(point.Address || point.PointAddress || '清運點')}</strong><span>${escapeHtml(point.RouteName || point.RemovalName || '')}</span></div><span class="distance">${escapeHtml(point.Distance ? `${point.Distance} m` : '')}</span></article>`).join('')
      : '<p class="empty">300 公尺內查無清運點</p>';

    const nearest = nearby[0];
    if (nearest && nearest.distance <= RANGE) {
      setStatus('near', '垃圾車已進入附近範圍', `${nearest.Car_Number} 約 ${Math.round(nearest.distance)} 公尺，於 ${nearest.Log_DTime} 回報`);
      const signature = `${nearest.Car_Unicode}-${nearest.Log_DTime}`;
      if (signature !== lastVehicleSignature) {
        lastVehicleSignature = signature;
        sendNotification('附近有垃圾車', `${nearest.Car_Number} 約 ${Math.round(nearest.distance)} 公尺`);
      }
    } else if (nearby.length) {
      setStatus('', '目前未進入監測範圍', `最近車輛約 ${Math.round(nearest.distance)} 公尺；監測範圍為 ${RANGE} 公尺`);
    } else {
      setStatus('error', '暫無即時車輛資料', '未取得範圍內車輛回報，稍後會自動再試');
    }

    document.getElementById('lastUpdated').textContent = `更新 ${new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`;
  } catch (error) {
    setStatus('error', '資料連線失敗', error.message || '請確認網路連線或稍後再試');
  } finally {
    document.getElementById('refreshButton').disabled = false;
  }
}

document.getElementById('refreshButton').addEventListener('click', refresh);
document.getElementById('notificationButton').addEventListener('click', async event => {
  if (!('Notification' in window)) {
    alert('此瀏覽器不支援通知');
    return;
  }
  const permission = await Notification.requestPermission();
  event.currentTarget.textContent = permission === 'granted' ? '通知已開' : '通知未開';
});

refresh();
setInterval(refresh, 30000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
