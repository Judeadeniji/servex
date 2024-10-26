export const checkOptionalParameter = (path: string): string[] | null => {
    /*
     If path is `/api/animals/:type?` it will return:
     [`/api/animals`, `/api/animals/:type`]
     in other cases it will return null
    */
  
    if (!path.match(/\:.+\?$/)) {
      return null
    }
  
    const segments = path.split('/')
    const results: string[] = []
    let basePath = ''
  
    segments.forEach((segment) => {
      if (segment !== '' && !/\:/.test(segment)) {
        basePath += '/' + segment
      } else if (/\:/.test(segment)) {
        if (/\?/.test(segment)) {
          if (results.length === 0 && basePath === '') {
            results.push('/')
          } else {
            results.push(basePath)
          }
          const optionalSegment = segment.replace('?', '')
          basePath += '/' + optionalSegment
          results.push(basePath)
        } else {
          basePath += '/' + segment
        }
      }
    })
  
    return results.filter((v, i, a) => a.indexOf(v) === i)
  }


  export const mergePath = (...paths: string[]): string => {
    let p: string = ''
    let endsWithSlash = false
  
    for (let path of paths) {
      /* ['/hey/','/say'] => ['/hey', '/say'] */
      if (p[p.length - 1] === '/') {
        p = p.slice(0, -1)
        endsWithSlash = true
      }
  
      /* ['/hey','say'] => ['/hey', '/say'] */
      if (path[0] !== '/') {
        path = `/${path}`
      }
  
      /* ['/hey/', '/'] => `/hey/` */
      if (path === '/' && endsWithSlash) {
        p = `${p}/`
      } else if (path !== '/') {
        p = `${p}${path}`
      }
  
      /* ['/', '/'] => `/` */
      if (path === '/' && p === '') {
        p = '/'
      }
    }
  
    return p
  }