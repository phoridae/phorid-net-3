import React from 'react';
import { List } from 'antd';
import './PhoridNewsletters.css';
import pnews2 from '../assets/pnews2.pdf';
import pnews3 from '../assets/pnews3.pdf';
import pnews4 from '../assets/pnews4.pdf';
import pnews5 from '../assets/pnews5.pdf';
import pnews6 from '../assets/pnews6.pdf';
import pnews7 from '../assets/pnews7.pdf';
import pnews8 from '../assets/pnews8.pdf';
import pnews9 from '../assets/pnews9.pdf';
import pnews10 from '../assets/pnews10.pdf';
import pnews11 from '../assets/pnews11.pdf';
import pnews12 from '../assets/pnews12.pdf';


const data = [
    {
        title: 'Phorid Newsletter 2',
        description: 'International Congress of Dipterology in Guelph, 1994',
        ref: pnews2
    },
    {
        title: 'Phorid Newsletter 3',
        description: 'Hunting Apocephalus in Costa Rica, 1995',
        ref: pnews3
    },
    {
        title: 'Phorid Newsletter 4',
        description: 'Morrison and Orr contributing, 1996',
        ref: pnews4

    },
    {
        title: 'Phorid Newsletter 5',
        description: 'Collecting in Ecuador',
        ref: pnews5

    },
    {
        title: 'Phorid Newsletter 6',
        description: 'Phorid news, 1997',
        ref: pnews6

    },
    {
        title: 'Phorid Newsletter 7',
        description: 'Phoridae of Costa Rica, 1998',
        ref: pnews7

    },
    {
        title: 'Phorid Newsletter 8',
        description: 'Natural history notes on Neotropical phorid flies, 2000',
        ref: pnews8

    },
    {
        title: 'Phorid Newsletter 9',
        description: 'Beginning to study the bee-killing flies, 2001',
        ref: pnews9

    },
    {
        title: 'Phorid Newsletter 10',
        description: `What's new in Los Angeles, 2004`,
        ref: pnews10

    },
    {
        title: 'Phorid Newsletter 11',
        description: 'Phorid collecting in New Zealand, 2006',
        ref: pnews11

    },
    {
        title: 'Phorid Newsletter 12',
        description: 'Update from Los Angeles, 2008',
        ref: pnews12

    },
    
  ];

  const PhoridNewsletters = () => {
    return (
    <div className='newsletterWrapper'>
        <h1>Phorid Newsletters</h1>
        <p> by Brian V. Brown</p>
        <p>Several years ago, I published a Phorid Newsletter for those interested in the family. They are posted here (as downloadable PDF files):</p>
        
        <div className='listWrapper'>

            <List
                itemLayout="horizontal"
                dataSource={data}
                renderItem={(item, index) => (
                    <List.Item>
                    <List.Item.Meta
                        title={<a href={item.ref}>{item.title}</a>}
                        description={item.description}
                        />
                    </List.Item>
                )}
            />
        </div>
      </div>
    );
  };

export default PhoridNewsletters;
