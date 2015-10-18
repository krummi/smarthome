# -*- coding: utf-8 -*-

import json

t = []
for i in open('test.txt'):
  x = i.strip().replace(' ', '\t').split('\t')
  y = {}
  y['quantity'] = x[0]
  y['unit'] = x[1]
  y['item'] = ' '.join(x[2:])
  t.append(y)

print unicode(json.dumps(t))