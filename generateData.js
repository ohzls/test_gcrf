// generateData.js

function generateHourlyCrowd() {
  const rand = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 100));
  return {
    average: rand(),
    today: rand()
  };
}

function generateExpectedTime() {
  const times = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  const pick = () => {
    const i = Math.floor(Math.random() * (times.length - 1));
    return { start: times[i], end: times[i + 1] };
  };
  return {
    average: pick(),
    today: pick()
  };
}

function attachDynamicFields(place) {
  return {
    ...place,
    hourlyCrowd: generateHourlyCrowd(),
    expectedTime: generateExpectedTime()
  };
}

export { attachDynamicFields };