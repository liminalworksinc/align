'use strict';

function pico_to_micros(pico) {
  return Number((pico + 500000n) / 1000000n);
}

module.exports = { pico_to_micros };
