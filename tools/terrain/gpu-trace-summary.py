#!/usr/bin/env python3
"""Summarize exported xctrace GPU counter XML without mistaking missing counters for zero.

First export metal-gpu-counter-intervals using xctrace. This parses that XML with
standard-library streaming and resolves xctrace's id/ref sharing. Counter values
have GPU-wide scope unless an independent source establishes process attribution.
"""
import argparse
import json
import math
from pathlib import Path
from xml.etree.ElementTree import iterparse


def summarize(path):
    references = {}
    counters = {}
    for event, element in iterparse(path, events=('start', 'end')):
        if event != 'end' or element.tag != 'row':
            continue
        for child in element.iter():
            if 'id' in child.attrib:
                references[child.attrib['id']] = (child.text or '', child.attrib.get('fmt', ''))

        def value(child):
            if child is None:
                raise ValueError('Missing counter column')
            if 'ref' in child.attrib:
                return references[child.attrib['ref']]
            return child.text or '', child.attrib.get('fmt', '')

        name = value(element.find('gpu-counter-name'))[1]
        gpu = value(element.find('metal-device-name'))[1]
        start = float(value(element.find('start-time'))[0]) / 1e9
        duration = float(value(element.find('duration'))[0]) / 1e9
        reading = float(value(element.find('fixed-decimal'))[0])
        label = value(element.find('formatted-label'))[1]
        if not all(math.isfinite(v) for v in (start, duration, reading)) or duration < 0:
            raise ValueError('Invalid GPU counter numeric value')
        key = (gpu, name)
        if key not in counters:
            counters[key] = dict(gpu=gpu, name=name, samples=0, minimum=reading, maximum=reading,
                                 startSeconds=start, endSeconds=start+duration, sampledSeconds=0,
                                 weightedTotal=0, exampleLabel=label)
        entry = counters[key]
        entry['samples'] += 1
        entry['minimum'] = min(entry['minimum'], reading)
        entry['maximum'] = max(entry['maximum'], reading)
        entry['startSeconds'] = min(entry['startSeconds'], start)
        entry['endSeconds'] = max(entry['endSeconds'], start+duration)
        entry['sampledSeconds'] += duration
        entry['weightedTotal'] += duration * reading
        element.clear()
    result = []
    for entry in counters.values():
        total = entry.pop('weightedTotal')
        entry['durationWeightedMean'] = total/entry['sampledSeconds'] if entry['sampledSeconds'] else None
        result.append(entry)
    for entry in result:
        span = entry['endSeconds'] - entry['startSeconds']
        entry['sampledDurationToSpanRatio'] = entry['sampledSeconds'] / span if span else None
    dram = [c for c in result if c['name'] in ('DRAM Bandwidth', 'DRAMBW')]
    memory = [c for c in result if c['name'] in ('GPU Bandwidth', 'GPU Read Bandwidth', 'GPU Write Bandwidth')]
    return dict(source=str(path), scope='GPU counters; process-exclusive attribution is not established',
                dramBandwidthAvailable=bool(dram), dramCounters=dram,
                externalMemoryBandwidthAvailable=bool(memory), externalMemoryCounters=memory,
                counters=result, note='Absent counters are unavailable, never zero. Units remain in exampleLabel; inspect the Apple counter definition. Sampling duration can differ from wall time.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('counter_xml', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = json.dumps(summarize(args.counter_xml), indent=2, allow_nan=False) + '\n'
    if args.output:
        args.output.write_text(result)
    else:
        print(result, end='')
