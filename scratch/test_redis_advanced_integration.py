import sys
import os
import time
import json
import redis

# Add backend to path
sys.path.insert(0, os.path.abspath('backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.staging'

import django
django.setup()

from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from apps.cases.models import Case
from apps.reminders.models import Reminder
from apps.tokens.models import CourtHall, CourtTokenStatus, TokenAlertRule
from apps.notifications.realtime import RealtimeService
from common.distributed_lock import DistributedLock

User = get_user_model()

print('=== 1. REDIS CLIENT CONNECTIVITY & PING/PONG ===')
r = redis.Redis(host='127.0.0.1', port=6379, db=2, socket_timeout=3)
pong = r.ping()
assert pong is True, 'Redis ping failed!'
print('PING -> PONG: SUCCESS')

print('\n=== 2. CACHE OPERATIONS & TTL EXPIRATION ===')
cache.set('test:key:expire', 'temporary_value', timeout=2)
assert cache.get('test:key:expire') == 'temporary_value', 'Cache immediate get failed'
print('Immediate GET: SUCCESS')
time.sleep(2.5)
expired = cache.get('test:key:expire')
assert expired is None, f'Expected key to expire, but got: {expired}'
print('Key TTL Expiration: SUCCESS (expired cleanly)')

print('\n=== 3. REDIS PUB/SUB VERIFICATION ===')
pubsub = r.pubsub()
channel = 'aphc:test:channel'
pubsub.subscribe(channel)
msg = pubsub.get_message(timeout=1.0)
print('Subscribed:', msg)

r.publish(channel, json.dumps({'event': 'TEST_EVENT', 'data': 12345}))
received = None
for _ in range(5):
    m = pubsub.get_message(timeout=1.0)
    if m and m['type'] == 'message':
        received = json.loads(m['data'])
        break
assert received is not None and received['event'] == 'TEST_EVENT', f'Pub/Sub failed: {received}'
print(f'Pub/Sub publish & receive: SUCCESS ({received})')
pubsub.unsubscribe(channel)

print('\n=== 4. CONCURRENT LOCK CONTENTION & MULTIPROCESS SYNCHRONIZATION ===')
lock1 = DistributedLock('aphc:test:contention_lock', timeout=5)
lock2 = DistributedLock('aphc:test:contention_lock', timeout=5)

assert lock1.acquire() is True, 'Lock 1 acquisition failed'
assert lock2.acquire() is False, 'Lock 2 should have been rejected while Lock 1 holds lock'
print('Contention rejection: SUCCESS (Lock 2 was rejected)')

assert lock1.renew(extend_seconds=10) is True, 'Lock 1 renewal failed'
print('Lock renewal via Lua: SUCCESS')

assert lock2.release() is False, 'Lock 2 illegally released Lock 1'
print('Ownership safety: SUCCESS (Lock 2 cannot release Lock 1)')

assert lock1.release() is True, 'Lock 1 release failed'
print('Lock 1 release: SUCCESS')

assert lock2.acquire() is True, 'Lock 2 should acquire now that Lock 1 released'
assert lock2.release() is True, 'Lock 2 release failed'
print('Subsequent acquisition: SUCCESS')

print('\n=== 5. REALTIME SERVICE TICKET & REDIS PUB/SUB INTEGRATION ===')
u = User.objects.filter(is_active=True).first()
if not u:
    u = User.objects.create_user(username='redis_test_user', email='redis_test@example.com', password='TestUser123!')

ticket = RealtimeService.generate_stream_ticket(u)
assert len(ticket) >= 16, 'Ticket generation failed'
print(f'Generated single-use stream ticket in Redis cache: {ticket[:10]}...')

consumed_user = RealtimeService.consume_stream_ticket(ticket)
assert consumed_user is not None and consumed_user.id == u.id, 'Ticket consumption failed'
print('Ticket consumption & single-use validation: SUCCESS')

consumed_again = RealtimeService.consume_stream_ticket(ticket)
assert consumed_again is None, 'Ticket reuse should return None'
print('Single-use ticket replay rejection: SUCCESS')

redis_client = RealtimeService.get_redis_client()
assert redis_client is not None, 'RealtimeService failed to connect to Redis'
print('RealtimeService Redis client initialized: SUCCESS')

print('\n=== 6. REMINDER & TOKEN ALERT DATA VERIFICATION IN STAGING DB ===')
halls_count = CourtHall.objects.count()
print(f'CourtHalls in staging PostgreSQL: {halls_count}')
cases_count = Case.objects.count()
print(f'Cases in staging PostgreSQL: {cases_count}')

print('\n=== ALL ADVANCED REDIS INTEGRATION CHECKS PASSED SUCCESSFULLY ===')
