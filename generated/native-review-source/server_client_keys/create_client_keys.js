'use strict';

function create_client_keys(resources) {
  const config = resources.config;

  function clientNet(ip) {
    let v = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    if (!v.includes(':')) return v;

    const dotted = v.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (dotted) {
      const octets = dotted.slice(2).map(Number);
      if (octets.some(octet => octet > 255)) return v;
      v = dotted[1] + ((octets[0] << 8) | octets[1]).toString(16)
        + ':' + ((octets[2] << 8) | octets[3]).toString(16);
    }

    const [head, tail = ''] = v.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = v.includes('::') && tail ? tail.split(':') : [];
    const groups = [
      ...headGroups,
      ...Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'),
      ...tailGroups,
    ].map(group => parseInt(group || '0', 16));

    if (groups.length === 8
        && groups.slice(0, 5).every(group => group === 0)
        && groups[5] === 0xffff) {
      return [groups[6] >> 8, groups[6] & 0xff,
        groups[7] >> 8, groups[7] & 0xff].join('.');
    }
    return groups.slice(0, 4)
      .map(group => Number.isNaN(group) ? '0' : group.toString(16))
      .join(':') + '::/64';
  }

  function clientOf(req) {
    if (!config().hosted) return 'local';
    const headers = req.headers;
    return 'ip:' + clientNet(headers.get('fly-client-ip') ?? 'unknown');
  }

  return { clientNet, clientOf };
}

exports.create_client_keys = create_client_keys;
