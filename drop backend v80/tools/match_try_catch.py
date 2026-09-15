import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
# remove block comments and line comments but preserve positions by replacing with spaces
s2=list(s)
for m in re.finditer(r'/\*.*?\*/',s,flags=re.S):
    for i in range(m.start(), m.end()): s2[i]=' '
for m in re.finditer(r'//.*',s):
    for i in range(m.start(), m.end()): s2[i]=' '

s_clean=''.join(s2)
# remove strings (replace with spaces)
for m in re.finditer(r"'(?:\\.|[^'\\])*'", s_clean):
    s_clean = s_clean[:m.start()] + ' '*(m.end()-m.start()) + s_clean[m.end():]
for m in re.finditer(r'\"(?:\\.|[^\\"])*\"', s_clean):
    s_clean = s_clean[:m.start()] + ' '*(m.end()-m.start()) + s_clean[m.end():]
for m in re.finditer(r'`(?:\\.|[^`\\])*`', s_clean):
    s_clean = s_clean[:m.start()] + ' '*(m.end()-m.start()) + s_clean[m.end():]

# find try tokens
for m in re.finditer(r'\btry\s*\{', s_clean):
    start = m.start()
    # find matching closing brace
    i = m.end()-1
    depth = 0
    found_close = -1
    while i < len(s_clean):
        c = s_clean[i]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                found_close = i
                break
        i += 1
    line = s.count('\n',0,start)+1
    if found_close == -1:
        print('Try at', line, 'has no closing brace')
        continue
    # after found_close, skip whitespace
    j = found_close+1
    while j < len(s_clean) and s_clean[j].isspace(): j+=1
    # check if next chars start with catch or finally
    next_token = s_clean[j:j+7]
    has = False
    if re.match(r'catch\b', s_clean[j:j+6]): has = True
    if re.match(r'finally\b', s_clean[j:j+7]): has = True
    if not has:
        # print context
        print('Try at',line,'closing at', s.count('\n',0,found_close)+1, 'no catch/finally found immediately after')
