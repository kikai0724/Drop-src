p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
start = s.find('function getItemShop()')
if start==-1:
    print('not found')
else:
    pos = s.find('{', start)
    i=pos
    depth=0
    while i < len(s):
        if s[i]=='{': depth+=1
        elif s[i]=='}':
            depth-=1
            if depth==0:
                end=i
                print('start line', s.count('\n',0,pos)+1, 'end line', s.count('\n',0,end)+1)
                break
        i+=1
