import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
for m in re.finditer(r'\btry\s*\{', s):
    line = s.count('\n',0,m.start())+1
    if 730 <= line <= 950:
        # find matching close
        i = m.end()-1
        depth=0
        while i < len(s):
            c=s[i]
            if c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    end_line = s.count('\n',0,i)+1
                    snippet = s.splitlines()[max(0,line-3):end_line+2]
                    print('TRY at',line,'closes at',end_line)
                    for idx,l in enumerate(snippet, start=max(0,line-3)+1):
                        print(idx, l)
                    print('----')
                    break
            i+=1
